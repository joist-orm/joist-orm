import { groupBy } from "joist-utils";

import { type Column } from "./columns.ts";
import { type PredicateBrand } from "./conditions.ts";
// Load configure first: relations must not evaluate before their base classes exist.
import { getConstructorFromTaggedId } from "./configure.ts";
import { withDeferredAlias } from "./DeferredAlias.ts";
import { type Entity } from "./Entity.ts";
import { type ExpressionCondition } from "./EntityFilter.ts";
import { type IdOf, type MaybeAbstractEntityConstructor, type TaggedId } from "./EntityManager.ts";
import {
  type EntityMetadata,
  type Field,
  type PolymorphicField,
  type PolymorphicFieldComponent,
  getBaseAndSelfMetas,
  getMetadata,
} from "./EntityMetadata.ts";
import { maybeResolveReferenceToId } from "./keys.ts";
import { type ColumnCondition, type ParsedValueFilter, type RawCondition, makeLike, mapToDb } from "./QueryParser.ts";
import { skipCondition } from "./skipCondition.ts";
import { type FieldsOf } from "./typeMap.ts";
import { fail } from "./utils.ts";

/** Creates an alias for complex domain filtering in `em.find`. */
export function alias<T extends Entity>(cstr: MaybeAbstractEntityConstructor<T>): Alias<T> {
  return newAliasProxy(cstr);
}

/** Creates multiple aliases for complex filtering. */
export function aliases<T extends readonly MaybeAbstractEntityConstructor<any>[]>(
  ...types: T
): { [P in keyof T]: T[P] extends MaybeAbstractEntityConstructor<infer E extends Entity> ? Alias<E> : never } {
  return types.map((t) => newAliasProxy(t)) as any;
}

export const aliasMgmt = Symbol("aliasMgmt");
const aliasColumn = Symbol("aliasColumn");

/** The identity and original entity metadata of an `em.find` alias. */
export interface AliasMgmt {
  tableName: string;
  meta: EntityMetadata;
  /**
   * Builds a raw condition using each query's bound metadata and SQL alias, before join pruning.
   * Return a fresh condition instead of mutating shared state; the callback runs only when used.
   */
  condition(build: (meta: EntityMetadata, alias: string) => RawCondition): RawCondition & PredicateBrand<"domain">;
}

/** Keeps domain aliases covariant in their entity type. */
export interface AliasBrand<T> extends AliasMgmt {
  readonly __entity: T;
}

/**
 * Domain field predicates, deliberately separate from SQL table expressions.
 *
 * An Alias names a place in an em.find relationship tree, not a fixed SQL table occurrence.
 * I.e. with `a = alias(Author)`, `{ author: { as: a } }` binds `a` to the Book's Author;
 * binding it under `{ author: { mentor: { as: a } } }` instead makes it the Author's mentor.
 * The find parser builds those joins and knows which entity metadata and SQL name apply there,
 * including any inheritance joins. The Alias cannot know that when `a.firstName.eq(name)` is created.
 *
 * DeferredAlias therefore resolves each predicate to a fresh column/raw condition using that parse's
 * binding. The resolved condition records the SQL aliases it reads, including both sides of a
 * cross-alias comparison. Join pruning uses those references to retain the joins the filter needs.
 * An undefined predicate is skipped, so it does not keep an otherwise-unused join alive; explicit
 * keepAliases and other query dependencies can still retain that join.
 *
 * Table expressions solve a different problem: their sources are supplied directly in from/join,
 * so they render through ExprContext rather than asking the find parser to bind a relationship path.
 * Neither path stores a resolved SQL name on the reusable handle or predicate.
 */
export type Alias<T extends Entity> = { readonly [aliasMgmt]: AliasBrand<T> } & {
  [P in keyof FieldsOf<T>]: P extends "id"
    ? EntityAlias<T>
    : FieldsOf<T>[P] extends { kind: "primitive" | "enum"; type: infer V; nullable: infer N }
      ? PrimitiveAlias<V, N extends undefined ? null : never>
      : FieldsOf<T>[P] extends { kind: "m2o"; type: infer U extends Entity; nullable: infer N }
        ? EntityAlias<U, N extends undefined ? null : never>
        : FieldsOf<T>[P] extends { kind: "poly"; type: infer U extends Entity }
          ? PolyAlias<U>
          : never;
};

/** A domain column accepted on the other side of a cross-alias comparison. */
export interface AliasColumn<V> {
  readonly [aliasColumn]: V;
}

export interface PrimitiveAlias<V, N extends null | never = never> extends AliasColumn<V | N> {
  eq(value: V | N | AliasColumn<V | null> | undefined): ExpressionCondition;
  ne(value: V | N | AliasColumn<V | null> | undefined): ExpressionCondition;
  in(values: readonly (V | null)[] | undefined): ExpressionCondition;
  nin(values: readonly (V | null)[] | undefined): ExpressionCondition;
  gt(value: V | AliasColumn<V | null> | undefined): ExpressionCondition;
  gte(value: V | AliasColumn<V | null> | undefined): ExpressionCondition;
  lt(value: V | AliasColumn<V | null> | undefined): ExpressionCondition;
  lte(value: V | AliasColumn<V | null> | undefined): ExpressionCondition;
  like(value: V | undefined): ExpressionCondition;
  ilike(value: V | undefined): ExpressionCondition;
  search(value: V | undefined): ExpressionCondition;
  between(v1: V | undefined, v2: V | undefined): ExpressionCondition;
  // V is already an array; strings also support jsonb contains.
  contains(value: string | V | AliasColumn<V | null> | N | undefined): ExpressionCondition;
  ncontains(value: string | V | AliasColumn<V | null> | N | undefined): ExpressionCondition;
  overlaps(value: V | AliasColumn<V | null> | N | undefined): ExpressionCondition;
  noverlaps(value: V | AliasColumn<V | null> | N | undefined): ExpressionCondition;
  /** Adds a parameterized JSON path existence condition using `@?`. */
  pathExists(jsonPath: string | undefined): ExpressionCondition;
  /** Adds a parameterized JSON path predicate condition using `@@`. */
  pathIsTrue(jsonPath: string | undefined): ExpressionCondition;
  /** Adds an operator and expression with knex-style placeholders, without the column name. */
  raw(exp: string, bindings: readonly unknown[] | undefined): ExpressionCondition;
}

export interface EntityAlias<T, N extends null | never = never> extends AliasColumn<IdOf<T> | N> {
  eq(value: T | IdOf<T> | AliasColumn<IdOf<T> | null> | null | undefined): ExpressionCondition;
  ne(value: T | IdOf<T> | AliasColumn<IdOf<T> | null> | null | undefined): ExpressionCondition;
  // Adding `| null` for GraphQL support
  in(values: readonly (T | IdOf<T> | null)[] | null | undefined): ExpressionCondition;
  nin(values: readonly (T | IdOf<T> | null)[] | null | undefined): ExpressionCondition;
  gt(value: IdOf<T> | AliasColumn<IdOf<T> | null> | null | undefined): ExpressionCondition;
  gte(value: IdOf<T> | AliasColumn<IdOf<T> | null> | null | undefined): ExpressionCondition;
  lt(value: IdOf<T> | AliasColumn<IdOf<T> | null> | null | undefined): ExpressionCondition;
  lte(value: IdOf<T> | AliasColumn<IdOf<T> | null> | null | undefined): ExpressionCondition;
  raw(exp: string, bindings: readonly unknown[] | undefined): ExpressionCondition;
}

export interface PolyAlias<T extends Entity> {
  eq(value: T | TaggedId | AliasColumn<IdOf<T> | null> | null | undefined): ExpressionCondition;
  ne(value: T | TaggedId | AliasColumn<IdOf<T> | null> | null | undefined): ExpressionCondition;
  in(values: readonly (T | TaggedId)[] | undefined): ExpressionCondition;
}

/** Returns the runtime identity bound by the find parser. */
export function getAliasMgmt(alias: { readonly [aliasMgmt]: AliasMgmt }): AliasMgmt {
  return alias[aliasMgmt];
}

/** Returns the original metadata, preserving STI subtype identity. */
export function getAliasMetadata<T extends Entity>(alias: Alias<T>): EntityMetadata<T> {
  return alias[aliasMgmt].meta as EntityMetadata<T>;
}

/** Creates domain predicates lazily from entity field metadata. */
export function newAliasProxy<T extends Entity>(cstr: MaybeAbstractEntityConstructor<T>): Alias<T> {
  const meta = getMetadata(cstr);
  const mgmt: AliasMgmt = {
    tableName: meta.tableName,
    meta,
    condition(build) {
      const cond: RawCondition = { kind: "raw", aliases: [], condition: "unset", bindings: [], pruneable: false };
      return withDeferredAlias(cond, (resolve, copy) => {
        const bound = resolve(mgmt);
        Object.assign(copy, build(bound.meta, bound.alias));
      });
    },
  };
  return new Proxy(cstr, {
    get(_, key) {
      if (key === aliasMgmt) return mgmt;
      if (typeof key !== "string") return undefined;
      const field = meta.allFields[key] ?? fail(`No field ${key} on ${cstr.name}`);
      if (field.kind === "poly") return new PolyReferenceAlias(meta, mgmt, field);
      if (["primaryKey", "primitive", "enum", "m2o"].includes(field.kind)) {
        return new AliasColumnImpl(meta, field, field.serde!.columns[0], mgmt);
      }
      return fail(`Unsupported alias field kind ${field.kind}`);
    },
    has(_, key) {
      return key === aliasMgmt || key in meta.allFields;
    },
  }) as unknown as Alias<T>;
}

/** Recognizes only domain aliases, not physical tables. */
export function isAlias(value: unknown): value is Alias<Entity> {
  return typeof value === "function" && aliasMgmt in value;
}

/** Builds field conditions without implementing the SQL expression protocol. */
class AliasColumnImpl {
  declare readonly [aliasColumn]: unknown;

  constructor(
    readonly meta: EntityMetadata,
    readonly field: Field & { aliasSuffix: string },
    readonly column: Column,
    readonly mgmt: AliasMgmt,
  ) {}

  eq(value: unknown): ExpressionCondition {
    return this.compare("eq", "=", value);
  }
  ne(value: unknown): ExpressionCondition {
    return this.compare("ne", "!=", value);
  }
  gt(value: unknown): ExpressionCondition {
    return this.compare("gt", ">", value);
  }
  gte(value: unknown): ExpressionCondition {
    return this.compare("gte", ">=", value);
  }
  lt(value: unknown): ExpressionCondition {
    return this.compare("lt", "<", value);
  }
  lte(value: unknown): ExpressionCondition {
    return this.compare("lte", "<=", value);
  }
  contains(value: unknown): ExpressionCondition {
    return this.compare("contains", "@>", value);
  }
  ncontains(value: unknown): ExpressionCondition {
    if (value instanceof AliasColumnImpl) return crossColumnCondition(this, value, "@>", true);
    return this.addCondition({ kind: "ncontains", value: value as readonly unknown[] });
  }
  overlaps(value: unknown): ExpressionCondition {
    return this.compare("overlaps", "&&", value);
  }
  noverlaps(value: unknown): ExpressionCondition {
    if (value instanceof AliasColumnImpl) return crossColumnCondition(this, value, "&&", true);
    return this.addCondition({ kind: "noverlaps", value: value as readonly unknown[] });
  }

  in(values: readonly unknown[] | null | undefined): ExpressionCondition {
    if (values === undefined) return skipCondition;
    if (values === null) return fail("Unsupported");
    if (values.includes(null)) {
      return {
        or: [
          this.addCondition({ kind: "is-null" }),
          this.addCondition({ kind: "in", value: values.filter((v) => v !== null) }),
        ],
      };
    }
    return this.addCondition({ kind: "in", value: [...values] });
  }

  nin(values: readonly unknown[] | null | undefined): ExpressionCondition {
    if (values === undefined) return skipCondition;
    if (values === null) return fail("Unsupported");
    return this.addCondition({ kind: "nin", value: values.filter((v) => v !== null) });
  }

  between(v1: unknown, v2: unknown): ExpressionCondition {
    if (v1 === undefined || v2 === undefined) return skipCondition;
    return this.addCondition({ kind: "between", value: [v1, v2] });
  }

  like(value: unknown): ExpressionCondition {
    return this.addCondition({ kind: "like", value });
  }
  ilike(value: unknown): ExpressionCondition {
    return this.addCondition({ kind: "ilike", value });
  }
  search(value: unknown): ExpressionCondition {
    // Check !value so that empty strings are pruned
    return !value ? skipCondition : this.addCondition({ kind: "ilike", value: makeLike(value) });
  }
  pathExists(value: string | undefined): ExpressionCondition {
    return this.addCondition({ kind: "jsonPathExists", value: value! });
  }
  pathIsTrue(value: string | undefined): ExpressionCondition {
    return this.addCondition({ kind: "jsonPathPredicate", value: value! });
  }

  raw(exp: string, bindings: readonly unknown[] | undefined): ExpressionCondition {
    if (bindings === undefined) return skipCondition;
    const cond: RawCondition = { kind: "raw", aliases: [], condition: "unset", pruneable: false, bindings };
    return withDeferredAlias(cond, (resolve, copy) => {
      const r = resolve(this.mgmt);
      const alias = getMaybeCtiAlias(this.meta, this.field, r.meta, r.alias);
      copy.aliases = [alias];
      copy.condition = `${alias}.${this.column.columnName} ${exp}`;
    });
  }

  /** Maps literal values through the field serde and binds aliases only when parsing. */
  addCondition(value: ParsedValueFilter<unknown>): ExpressionCondition {
    if ("value" in value && value.value === undefined) return skipCondition;
    const cond: ColumnCondition = {
      kind: "column",
      alias: "unset",
      column: this.column.columnName,
      dbType: this.column.dbType,
      cond: mapToDb(this.column, value),
    };
    return withDeferredAlias(cond, (resolve, copy) => {
      const r = resolve(this.mgmt);
      copy.alias = getMaybeCtiAlias(this.meta, this.field, r.meta, r.alias);
    });
  }

  /** Handles literal values, NULL, and domain cross-alias comparisons. */
  private compare(
    kind: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "ncontains" | "overlaps",
    op: string,
    value: unknown,
  ): ExpressionCondition {
    if (value === undefined) return skipCondition;
    if (value instanceof AliasColumnImpl) return crossColumnCondition(this, value, op);
    if (value === null && (kind === "eq" || kind === "ne"))
      return this.addCondition({ kind: kind === "eq" ? "is-null" : "not-null" });
    if (value === null && ["gt", "gte", "lt", "lte"].includes(kind)) return fail("Unsupported");
    return this.addCondition({ kind, value } as ParsedValueFilter<unknown>);
  }
}

/** Resolves polymorphic predicates to their physical component columns. */
class PolyReferenceAlias {
  constructor(
    private meta: EntityMetadata,
    private mgmt: AliasMgmt,
    private field: PolymorphicField & { aliasSuffix: string },
  ) {}

  eq(value: unknown): ExpressionCondition {
    return this.addEqOrNe("eq", value);
  }
  ne(value: unknown): ExpressionCondition {
    return this.addEqOrNe("ne", value);
  }

  in(values: readonly (Entity | TaggedId)[] | undefined): ExpressionCondition {
    if (values === undefined) return skipCondition;
    // Split up the ids by constructor
    const groups = groupBy(values, (id) => getConstructorFromTaggedId(maybeResolveReferenceToId(id)!).name);
    // Or together `parent_book_id in (1,2,3) OR parent_author_id IN (4,5,6)`
    return {
      or: Object.entries(groups).map(([name, ids]) => {
        const comp =
          this.field.components.find((c) => c.otherMetadata().cstr.name === name) ?? fail(`No component for ${name}`);
        return this.component(comp).addCondition({ kind: "in", value: ids });
      }),
    };
  }

  /** Picks the component from an entity, tagged id, or another domain alias column. */
  private addEqOrNe(kind: "eq" | "ne", value: unknown): ExpressionCondition {
    if (value === undefined) return skipCondition;
    if (value === null) {
      // We can AND each of the components as many conditions
      return {
        and: this.field.components.map((c) =>
          this.component(c).addCondition({ kind: kind === "eq" ? "is-null" : "not-null" }),
        ),
      };
    }
    const otherMeta =
      value instanceof AliasColumnImpl
        ? value.field.kind === "m2o"
          ? value.field.otherMetadata()
          : value.meta
        : getMetadata(getConstructorFromTaggedId(maybeResolveReferenceToId(value as Entity | TaggedId)!));
    const comp =
      this.field.components.find((c) => getBaseAndSelfMetas(otherMeta).includes(c.otherMetadata())) ??
      fail(`${this.field.fieldName} has no component for ${otherMeta.type}`);
    const column = this.component(comp);
    return kind === "eq" ? column.eq(value) : column.ne(value);
  }

  /** Uses the component serde, not the first component's codec. */
  private component(comp: PolymorphicFieldComponent): AliasColumnImpl {
    const column = this.field.serde.columns.find((c) => c.columnName === comp.columnName) ?? fail("Missing column");
    return new AliasColumnImpl(this.meta, this.field, column, this.mgmt);
  }
}

/** Adjusts a field's SQL alias when a base alias is bound to a CTI subtype in the join tree. */
export function getMaybeCtiAlias(
  meta: EntityMetadata,
  field: Field & { aliasSuffix: string },
  newMeta: EntityMetadata,
  newAlias: string,
): string {
  // Do we have mismatched `em.find(ChildMeta)` with a `alias(BaseMeta)`? If so, the
  // usual `${field.aliasSuffix}` won't know it should have a suffix, so we need to calc it.
  if (newMeta !== meta && newMeta.inheritanceType === "cti") {
    const bases = getBaseAndSelfMetas(newMeta);
    const fieldIsFromBase = bases.includes(newMeta);
    if (fieldIsFromBase) return `${newAlias}_b0`;
  }
  return `${newAlias}${field.aliasSuffix}`;
}

/** Compares domain columns with per-parse aliases, preserving condition reuse across find calls. */
function crossColumnCondition(
  left: AliasColumnImpl,
  right: AliasColumnImpl,
  op: string,
  negate = false,
): RawCondition & PredicateBrand<"domain"> {
  const cond: RawCondition = { kind: "raw", aliases: [], condition: "unset", bindings: [], pruneable: false };
  return withDeferredAlias(cond, (resolve, copy) => {
    const l = resolve(left.mgmt);
    const r = resolve(right.mgmt);
    const a1 = getMaybeCtiAlias(left.meta, left.field, l.meta, l.alias);
    const a2 = getMaybeCtiAlias(right.meta, right.field, r.meta, r.alias);
    copy.aliases = [a1, a2];
    const sql = `${a1}.${left.column.columnName} ${op} ${a2}.${right.column.columnName}`;
    copy.condition = negate ? `NOT (${sql})` : sql;
  });
}

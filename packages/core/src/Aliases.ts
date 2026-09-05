import { groupBy } from "joist-utils";

// Load-order only: without this, the built cjs/esm module graph evaluates relations/* before their
// base classes exist ("Class extends value undefined"); keep it even though no symbol is imported.
import "./configure.ts";
import { type Entity, type IdType } from "./Entity.ts";
import { type IdOf, type MaybeAbstractEntityConstructor, type TaggedId } from "./EntityManager.ts";
import {
  type EntityMetadata,
  type Field,
  type ManyToManyField,
  type ManyToOneField,
  type LargeOneToManyField,
  type OneToManyField,
  type OneToOneField,
  type PolymorphicField,
  type PolymorphicFieldComponent,
  getBaseAndSelfMetas,
  getMetadata,
} from "./EntityMetadata.ts";
import {
  BaseExpr,
  type Expr,
  type ExprContext,
  type ExprLike,
  type InnerJoin,
  type LeftJoin,
  type SqlFragment,
  asNode,
  deferredCondition,
  withDeferredAlias,
  isExpr,
  skipCondition,
} from "./Expr.ts";
import {
  type ExpressionCondition,
  type ExpressionFilter,
  getConstructorFromTaggedId,
  maybeResolveReferenceToId,
} from "./index.ts";
import { kqDot } from "./keywords.ts";
import { type ColumnCondition, type ParsedValueFilter, type RawCondition, makeLike, mapToDb } from "./QueryParser.ts";
import { PojoRowData } from "./RowData.ts";
import { type Column } from "./serde.ts";
import { type FieldsOf, type RootTypeNameOf } from "./typeMap.ts";
import { fail } from "./utils.ts";

/** Creates an alias for complex filtering against `T`. */
export function alias<T extends Entity>(cstr: MaybeAbstractEntityConstructor<T>): Alias<T>;
/**
 * Creates an alias with an explicit type-level name, i.e. `alias(Author, "m")` for a self-join.
 *
 * The name is the alias's source key in `em.query`: two bare `alias(Author)`s share the key `"Author"`,
 * so a left-joined mentor would also mark the mentee's columns nullable; a named alias has its own key.
 */
export function alias<T extends Entity, Name extends string>(
  cstr: MaybeAbstractEntityConstructor<T>,
  name: Name,
): Alias<T, Name>;
export function alias<T extends Entity>(cstr: MaybeAbstractEntityConstructor<T>, _name?: string): Alias<T, any> {
  // The name only exists at the type level; the SQL alias is still assigned by the query parser
  return newAliasProxy(cstr);
}

/** Creates multiple aliases for complex filtering. */
export function aliases<T extends readonly MaybeAbstractEntityConstructor<any>[]>(
  ...type: T
): { [P in keyof T]: T[P] extends MaybeAbstractEntityConstructor<infer E extends Entity> ? Alias<E> : never } {
  return type.map((t) => newAliasProxy(t)) as any;
}

/**
 * The runtime management interface plus phantom type information for `em.query`.
 *
 * `__entity` lets `QueryRow` recover `T` for entity mode (you cannot `infer T` back out of a mapped
 * type), and `__name` is the alias's source key (see `Expr`).
 */
export interface AliasBrand<T, Name extends string> extends AliasMgmt {
  readonly __entity: T;
  readonly __name: Name;
}

/**
 * An alias for `T`: one expression per field, each usable as a condition builder (`a.age.gte(18)`,
 * as in `em.find`) and as a selectable, aggregatable expression (`a.age`, `a.age.max()`, in `em.query`).
 *
 * `Name` is the alias's type-level source key, defaulting to the entity's root type name (see
 * `RootTypeNameOf`); `alias(Author, "m")` gives a self-join alias its own key.
 */
export type Alias<T extends Entity, Name extends string = RootTypeNameOf<T>> = {
  readonly [aliasMgmt]: AliasBrand<T, Name>;
} & {
  [P in keyof FieldsOf<T>]: P extends "id"
    ? EntityAlias<T, never, Name>
    : FieldsOf<T>[P] extends { kind: "primitive" | "enum"; type: infer V; nullable: infer N }
      ? PrimitiveAlias<V, N extends undefined ? null : never, Name>
      : FieldsOf<T>[P] extends { kind: "m2o"; type: infer U extends Entity; nullable: infer N }
        ? ReferenceAlias<U, N extends undefined ? null : never, Name>
        : FieldsOf<T>[P] extends { kind: "poly"; type: infer U extends Entity; nullable: infer N }
          ? PolyAlias<U, N extends undefined ? null : never>
          : FieldsOf<T>[P] extends { kind: "o2m" | "m2m" | "o2o"; type: infer U extends Entity }
            ? CollectionAlias<U>
            : never;
};

/** Any alias whose entity is (a subtype of) `U`, i.e. what a relation join factory accepts. */
export type AliasFor<U> = { readonly [aliasMgmt]: AliasBrand<U, string> };

/**
 * A collection relation (o2m/o2o/m2m) as a join factory: `a.books.as(b)` returns the same
 * `{ left: b, on: ... }` entry the expanded form writes, with the FK condition built from metadata, so
 * join-list inference, nullability, scope checking, and pruning are unchanged and both forms mix freely.
 *
 * `as` binds the joined alias, the same way em.find's `{ books: { as: b } }` does. The default is LEFT
 * (a collection may be empty, and a LEFT join never filters rows, so pruning it is always safe);
 * `.inner(b)` opts into filtering. An m2m entry carries a hidden second join through the join table,
 * which the parser expands; the pair prunes together.
 */
export interface CollectionAlias<U extends Entity> {
  as<A extends AliasFor<U>>(other: A): LeftJoin<A>;
  inner<A extends AliasFor<U>>(other: A): InnerJoin<A>;
  left<A extends AliasFor<U>>(other: A): LeftJoin<A>;
}

/**
 * An m2o relation: the FK column expression (`b.author` selects/compares the FK) plus a join factory
 * (`b.author.as(a)` joins). The default join kind follows the field's nullability, em.find's rule:
 * a required reference is INNER, a nullable one is LEFT, and the row type reflects it.
 */
export interface ReferenceAlias<U extends Entity, N extends null | never, Src extends string> extends EntityAlias<
  U,
  N,
  Src
> {
  as<A extends AliasFor<U>>(other: A): [N] extends [never] ? InnerJoin<A> : LeftJoin<A>;
  inner<A extends AliasFor<U>>(other: A): InnerJoin<A>;
  left<A extends AliasFor<U>>(other: A): LeftJoin<A>;
}

/**
 * A polymorphic reference: condition methods (each resolving the component column from the value), plus
 * a join factory that picks the component from the argument's entity, i.e. `c.parent.as(a)` joins
 * through `parent_author_id`, like an explicit join with `on: c.parent.eq(a.id)`.
 */
export interface PolyAlias<U extends Entity, N extends null | never> {
  as<A extends AliasFor<U>>(other: A): [N] extends [never] ? InnerJoin<A> : LeftJoin<A>;
  inner<A extends AliasFor<U>>(other: A): InnerJoin<A>;
  left<A extends AliasFor<U>>(other: A): LeftJoin<A>;
  eq(value: U | TaggedId | null | undefined | ExprLike<IdOf<U> | null>): ExpressionCondition;
  ne(value: U | TaggedId | null | undefined | ExprLike<IdOf<U> | null>): ExpressionCondition;
  in(values: Array<U | TaggedId> | undefined | ExprLike<IdOf<U> | null>): ExpressionCondition;
}

export interface PrimitiveAlias<V, N extends null | never, Src extends string = string> extends Expr<V | N, Src> {
  eq(value: V | N | undefined | ExprLike<V | N>): ExpressionCondition;
  ne(value: V | N | undefined | ExprLike<V | N>): ExpressionCondition;
  in(values: readonly (V | null)[] | undefined | ExprLike<V | null>): ExpressionCondition;
  nin(values: readonly (V | null)[] | undefined | ExprLike<V | null>): ExpressionCondition;
  gt(value: V | undefined | ExprLike<V | N>): ExpressionCondition;
  gte(value: V | undefined | ExprLike<V | N>): ExpressionCondition;
  lt(value: V | undefined | ExprLike<V | N>): ExpressionCondition;
  lte(value: V | undefined | ExprLike<V | N>): ExpressionCondition;
  like(value: V | undefined): ExpressionCondition;
  ilike(value: V | undefined): ExpressionCondition;
  search(value: V | undefined): ExpressionCondition;
  between(v1: V | undefined, v2: V | undefined): ExpressionCondition;
  // need to move to ArrayAlias
  // ...added the `string` to support jsonb contains like `WHERE profile @> '{"age": 25}'`
  // Ideally this would go in a JsonbAlias
  contains(value: string | V | N | undefined | PrimitiveAlias<V, any>): ExpressionCondition;
  ncontains(value: string | V | N | undefined | PrimitiveAlias<V, any>): ExpressionCondition;
  overlaps(value: V | N | undefined | PrimitiveAlias<V, any>): ExpressionCondition;
  noverlaps(value: V | N | undefined | PrimitiveAlias<V, any>): ExpressionCondition;

  /**
   * Adds a JSON path existence condition, using the `@?` operator.
   *
   * Any values should be embedded directly within the `jsonPath`, because postgres does not
   * support parameterized JSON path expressions. The entire `jsonPath` is treated as a parameter,
   * so this is safe from SQL injection.
   */
  pathExists(jsonPath: string | undefined): ExpressionCondition;

  /**
   * Adds a JSON path predicate condition, using the `@@` operator.
   *
   * Any values should be embedded directly within the `jsonPath`, because postgres does not
   * support parameterized JSON path expressions. The entire `jsonPath` is treated as a parameter,
   * so this is safe from SQL injection.
   */
  pathIsTrue(jsonPath: string | undefined): ExpressionCondition;

  /**
   * Add `exp` to the query, which should include the operator & expression and any
   * bound parameters (but not include the column name).
   *
   * We use knex-style placeholders, i.e. `?` and `\\?` to escape question marks, i.e.
   *
   * ```ts
   * a.address.raw("@\\? ?", ['$.street ? (@ == "rr2")'])`
   * ```
   */
  raw(exp: string, bindings: readonly any[] | undefined): ExpressionCondition;
}

export interface EntityAlias<T, N extends null | never = never, Src extends string = string> extends Expr<
  IdOf<T> | N,
  Src
> {
  eq(value: T | IdOf<T> | null | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition;
  ne(value: T | IdOf<T> | null | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition;
  // Adding `| null` for GraphQL support
  in(value: readonly (T | IdOf<T> | null)[] | null | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition;
  nin(value: readonly (T | IdOf<T> | null)[] | null | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition;
  gt(value: IdOf<T> | null | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition;
  gte(value: IdOf<T> | null | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition;
  lt(value: IdOf<T> | null | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition;
  lte(value: IdOf<T> | null | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition;
  raw(exp: string, bindings: readonly any[] | undefined): ExpressionCondition;
}

export const aliasMgmt = Symbol("aliasMgmt");

export function getAliasMgmt(alias: Alias<any, any>): AliasMgmt {
  return (alias as any)[aliasMgmt];
}

/** The identity both parsers bind an `alias(...)` by, plus the metadata it was created with. */
export interface AliasMgmt {
  tableName: string;
  /**
   * The metadata this alias was created with, i.e. `alias(TaskNew)` keeps `taskNewMeta`.
   *
   * It cannot be re-derived from `tableName`: STI subtypes share their base's table (`Task`, `TaskNew`,
   * and `TaskOld` are all `tasks`), so a `getMetadataForTable("tasks")` lookup can only return the base
   * `Task`, and the alias would lose its subtype identity (its discriminator filter and its constructor
   * for entity-mode hydration).
   */
  meta: EntityMetadata;
}

/** Returns the metadata for the entity that `alias` is bound to. */
export function getAliasMetadata<T extends Entity>(alias: Alias<T, any>): EntityMetadata<T> {
  const mgmt: AliasMgmt = (alias as any)[aliasMgmt];
  return mgmt.meta as EntityMetadata<T>;
}

export function newAliasProxy<T extends Entity>(cstr: MaybeAbstractEntityConstructor<T>): Alias<T> {
  const meta = getMetadata(cstr);
  // The identity both parsers bind: `em.find` maps it to a join-literal location, `em.query` to a source
  const mgmt: AliasMgmt = { tableName: meta.tableName, meta };
  const proxy: any = new Proxy(cstr, {
    /** Create a column alias, or a relation join factory, for the given field. */
    get(_, key: PropertyKey): any {
      if (key === aliasMgmt) {
        return mgmt;
      }
      const field = meta.allFields[key as string] ?? fail(`No field ${String(key)} on ${cstr.name}`);
      switch (field.kind) {
        case "primaryKey":
        case "primitive":
        case "enum":
          return new PrimitiveAliasImpl(meta, field, field.serde!.columns[0], mgmt);
        case "m2o":
          return new EntityAliasImpl(meta, field, field.serde!.columns[0], mgmt);
        case "poly":
          return new PolyReferenceAlias(meta, mgmt, field);
        case "o2m":
        case "o2o":
        case "lo2m":
          return new OneToManyAliasImpl(proxy, field);
        case "m2m":
          return new ManyToManyAliasImpl(proxy, field);
        default:
          throw new Error(`Unsupported alias field kind ${field.kind}`);
      }
    },

    has(_, key) {
      return key === aliasMgmt || key in meta.allFields;
    },
  });
  return proxy;
}

export function isAlias(obj: any): obj is Alias<any, any> & { [aliasMgmt]: AliasMgmt } {
  // Oddly enough `typeof` will be a function b/c we are proxying the constructors
  return obj && typeof obj === "function" && obj[aliasMgmt] !== undefined;
}

/**
 * A single column of an alias.
 *
 * For `em.find`, its methods create `ColumnCondition`s that resolve their alias against each parse's
 * join-literal bindings.
 *
 * For `em.query`, the column also implements `Expr`: it renders as `alias."column"`, decodes result
 * values through the field's serde, and inherits aggregate methods from `BaseExpr`.
 */
class AbstractAliasColumn<V> extends BaseExpr {
  public constructor(
    readonly meta: EntityMetadata,
    readonly field: Field & { aliasSuffix: string },
    readonly column: Column,
    readonly mgmt: AliasMgmt,
  ) {
    super();
  }

  toSql(ctx: ExprContext): SqlFragment {
    const alias = ctx.aliasFor(this.mgmt);
    const ctiAlias = getMaybeCtiAlias(this.meta, this.field, this.meta, alias);
    return { sql: kqDot(ctiAlias, this.column.columnName), bindings: [], refs: [alias] };
  }

  /** Decodes a result-set value the same way `hydrate` would, i.e. an int into a tagged id. */
  decode(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    const data: any = {};
    this.field.serde!.setOnEntityFromRowData(data, new PojoRowData([{ [this.column.columnName]: value }]), 0);
    return data[this.field.fieldName];
  }

  encode(value: unknown): unknown {
    return this.column.mapToDb(value);
  }

  protected addCondition(value: ParsedValueFilter<V>): ColumnCondition {
    const cond: ColumnCondition = {
      kind: "column",
      alias: "unset",
      column: this.column.columnName,
      dbType: this.column.dbType,
      cond: mapToDb(this.column, value),
    };
    return withDeferredAlias(cond, (resolve) => {
      const r = resolve(this.mgmt);
      cond.alias = getMaybeCtiAlias(this.meta, this.field, r.meta, r.alias);
    });
  }

  protected addRawCondition(exp: string, bindings: readonly any[]): RawCondition {
    const cond: RawCondition = { kind: "raw", aliases: [], condition: "unset", pruneable: false, bindings };
    return withDeferredAlias(cond, (resolve) => {
      const r = resolve(this.mgmt);
      const alias = getMaybeCtiAlias(this.meta, this.field, r.meta, r.alias);
      cond.aliases = [alias];
      cond.condition = `${alias}.${this.column.columnName} ${exp}`;
    });
  }

  protected addCrossColumnRawCondition(otherColumn: AbstractAliasColumn<any>, op: string): RawCondition {
    const cond: RawCondition = { kind: "raw", aliases: [], condition: "unset", pruneable: false, bindings: [] };
    return withDeferredAlias(cond, (resolve) => {
      const r1 = resolve(this.mgmt);
      const r2 = resolve(otherColumn.mgmt);
      const a1 = getMaybeCtiAlias(this.meta, this.field, r1.meta, r1.alias);
      const a2 = getMaybeCtiAlias(otherColumn.meta, otherColumn.field, r2.meta, r2.alias);
      cond.aliases = [a1, a2];
      cond.condition = `${a1}.${this.column.columnName} ${op} ${a2}.${otherColumn.column.columnName}`;
    });
  }

  /**
   * Compares this column to another expression.
   *
   * Another alias column becomes a `DeferredAliasCondition`, which both parsers can resolve, so it also
   * works inside `em.find`'s complex conditions; every other expression (an aggregate, a subquery column,
   * a `sql` template) only exists in `em.query`, so it takes the `ExprContext`-deferred path, which only
   * the `em.query` parser resolves.
   */
  protected compareToExpr(op: string, value: ExprLike<any>): ExpressionCondition {
    if (value instanceof AbstractAliasColumn) return this.addCrossColumnRawCondition(value, op);
    return this.compare(op, value);
  }
}

class PrimitiveAliasImpl<V, N extends null | never> extends AbstractAliasColumn<V> implements PrimitiveAlias<V, N> {
  eq(value: V | N | ExprLike<V | N> | undefined): ExpressionCondition {
    if (value === undefined) return skipCondition;
    if (value === null) return this.addCondition({ kind: "is-null" });
    if (isExpr(value)) return this.compareToExpr("=", value);
    return this.addCondition({ kind: "eq", value: value as any });
  }

  ne(value: V | N | ExprLike<V | N> | undefined): ExpressionCondition {
    if (value === undefined) return skipCondition;
    if (value === null) return this.addCondition({ kind: "not-null" });
    if (isExpr(value)) return this.compareToExpr("!=", value);
    return this.addCondition({ kind: "ne", value: value as any });
  }

  gt(value: V | ExprLike<V | N> | undefined): ExpressionCondition {
    if (value === undefined) return skipCondition;
    if (isExpr(value)) return this.compareToExpr(">", value);
    return this.addCondition({ kind: "gt", value: value as any });
  }

  gte(value: V | ExprLike<V | N> | undefined): ExpressionCondition {
    if (value === undefined) return skipCondition;
    if (isExpr(value)) return this.compareToExpr(">=", value);
    return this.addCondition({ kind: "gte", value: value as any });
  }

  lt(value: V | ExprLike<V | N> | undefined): ExpressionCondition {
    if (value === undefined) return skipCondition;
    if (isExpr(value)) return this.compareToExpr("<", value);
    return this.addCondition({ kind: "lt", value: value as any });
  }

  lte(value: V | ExprLike<V | N> | undefined): ExpressionCondition {
    if (value === undefined) return skipCondition;
    if (isExpr(value)) return this.compareToExpr("<=", value);
    return this.addCondition({ kind: "lte", value: value as any });
  }

  between(v1: V | undefined, v2: V | undefined): ColumnCondition {
    if (v1 === undefined || v2 === undefined) return skipCondition;
    return this.addCondition({ kind: "between", value: [v1, v2] });
  }

  like(value: V | undefined): ColumnCondition {
    if (value === undefined) return skipCondition;
    return this.addCondition({ kind: "like", value });
  }

  ilike(value: V | undefined): ColumnCondition {
    if (value === undefined) return skipCondition;
    return this.addCondition({ kind: "ilike", value });
  }

  search(value: V | undefined): ColumnCondition {
    // Check !value so that empty strings are pruned
    if (!value) return skipCondition;
    return this.addCondition({ kind: "ilike", value: makeLike(value) });
  }

  in(values: readonly (V | null)[] | ExprLike<V | null> | undefined): ExpressionCondition {
    if (values === undefined) return skipCondition;
    if (isExpr(values)) return this.inList("IN", values);
    if (values.includes(null)) {
      const isNull = this.addCondition({ kind: "is-null" });
      const hasValue = this.addCondition({ kind: "in", value: values.filter((v) => v !== null) });
      return { or: [isNull, hasValue] };
    } else {
      return this.addCondition({ kind: "in", value: values as V[] });
    }
  }

  nin(values: readonly (V | null)[] | ExprLike<V | null> | undefined): ExpressionCondition {
    if (values === undefined) return skipCondition;
    if (isExpr(values)) return this.inList("NOT IN", values);
    return this.addCondition({ kind: "nin", value: values.filter((v) => v !== null) as V[] });
  }

  // V will already be an array
  contains(v1: string | V | undefined): ColumnCondition {
    if (v1 === undefined) return skipCondition;
    return this.addCondition({ kind: "contains", value: v1 as any });
  }

  // V will already be an array
  ncontains(v1: string | V | undefined): ColumnCondition {
    if (v1 === undefined) return skipCondition;
    return this.addCondition({ kind: "ncontains", value: v1 as any });
  }

  // V will already be an array
  overlaps(v1: V | undefined): ColumnCondition {
    if (v1 === undefined) return skipCondition;
    return this.addCondition({ kind: "overlaps", value: v1 as any });
  }

  noverlaps(v1: V | undefined): ColumnCondition {
    if (v1 === undefined) return skipCondition;
    return this.addCondition({ kind: "noverlaps", value: v1 as any });
  }

  pathExists(jsonPath: string | undefined): ColumnCondition {
    if (jsonPath === undefined) return skipCondition;
    return this.addCondition({ kind: "jsonPathExists", value: jsonPath });
  }

  pathIsTrue(jsonPath: string | undefined): ColumnCondition {
    if (jsonPath === undefined) return skipCondition;
    return this.addCondition({ kind: "jsonPathPredicate", value: jsonPath });
  }

  raw(exp: string, bindings: readonly any[] | undefined): RawCondition | ColumnCondition {
    if (bindings === undefined) return skipCondition;
    return this.addRawCondition(exp, bindings);
  }
}

class EntityAliasImpl<T> extends AbstractAliasColumn<IdType> implements EntityAlias<T> {
  eq(value: T | IdOf<T> | null | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition {
    if (value === undefined) return skipCondition;
    if (value === null) return this.addCondition({ kind: "is-null" });
    if (isExpr(value)) return this.compareToExpr("=", value);
    return this.addCondition({ kind: "eq", value: value as any });
  }

  ne(value: T | IdOf<T> | null | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition {
    if (value === undefined) return skipCondition;
    if (value === null) return this.addCondition({ kind: "not-null" });
    if (isExpr(value)) return this.compareToExpr("!=", value);
    return this.addCondition({ kind: "ne", value: value as any });
  }

  in(values: readonly (T | IdOf<T> | null)[] | undefined | null | ExprLike<IdOf<T> | null>): ExpressionCondition {
    if (values === undefined) {
      return skipCondition;
    } else if (values === null) {
      throw new Error("Unsupported");
    } else if (isExpr(values)) {
      return this.inList("IN", values);
    } else if (values.includes(null)) {
      // Like `PrimitiveAlias.in`, split `[a1, null]` into `IS NULL OR IN (...)`
      const isNull = this.addCondition({ kind: "is-null" });
      const hasValue = this.addCondition({ kind: "in", value: values.filter((v) => v !== null) as any });
      return { or: [isNull, hasValue] };
    } else {
      return this.addCondition({ kind: "in", value: values as any });
    }
  }

  nin(values: readonly (T | IdOf<T> | null)[] | undefined | null | ExprLike<IdOf<T> | null>): ExpressionCondition {
    if (values === undefined) {
      return skipCondition;
    } else if (values === null) {
      throw new Error("Unsupported");
    } else if (isExpr(values)) {
      return this.inList("NOT IN", values);
    } else {
      return this.addCondition({ kind: "nin", value: values.filter((v) => v !== null) as any });
    }
  }

  gt(value: IdOf<T> | null | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition {
    return this.compareId(">", "gt", value);
  }

  gte(value: IdOf<T> | null | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition {
    return this.compareId(">=", "gte", value);
  }

  lt(value: IdOf<T> | null | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition {
    return this.compareId("<", "lt", value);
  }

  lte(value: IdOf<T> | null | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition {
    return this.compareId("<=", "lte", value);
  }

  raw(exp: string, bindings: readonly any[] | undefined): RawCondition | ColumnCondition {
    if (bindings === undefined) return skipCondition;
    return this.addRawCondition(exp, bindings);
  }

  /** Joins `other` via this FK, INNER for a required reference and LEFT for a nullable one. */
  as(other: object): object {
    return this.joinEntry((this.field as ManyToOneField).required ? "inner" : "left", other);
  }

  inner(other: object): object {
    return this.joinEntry("inner", other);
  }

  left(other: object): object {
    return this.joinEntry("left", other);
  }

  private joinEntry(kind: JoinKind, other: object): object {
    return { [kind]: requireAlias(other), on: this.eq(idColumnOf(other)) };
  }

  private compareId(op: string, kind: "gt" | "gte" | "lt" | "lte", value: unknown): ExpressionCondition {
    if (value === undefined) return skipCondition;
    if (value === null) throw new Error("Unsupported");
    if (isExpr(value)) return this.compareToExpr(op, value);
    return this.addCondition({ kind, value: value as any });
  }
}

class PolyReferenceAlias<T extends Entity> {
  public constructor(
    private meta: EntityMetadata,
    private mgmt: AliasMgmt,
    private field: PolymorphicField & { aliasSuffix: string },
  ) {}

  /** Compares to a tagged id, an entity, or another alias's id column, which picks the component (`c.parent.eq(a.id)`). */
  eq(value: T | TaggedId | null | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition {
    return this.addEqOrNe("eq", value);
  }

  ne(value: T | TaggedId | null | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition {
    return this.addEqOrNe("ne", value);
  }

  // We required tagged ids for polys
  in(values: Array<T | TaggedId> | undefined | ExprLike<IdOf<T> | null>): ExpressionCondition {
    if (values === undefined) return skipCondition;
    if (isExpr(values)) return this.inSubquery(values);
    // Split up the ids by constructor
    const idsByConstructor = groupBy(values, (id) => getConstructorFromTaggedId(maybeResolveReferenceToId(id)!).name);
    // Or together `parent_book_id in (1,2,3) OR parent_author_id IN (4,5,6)`
    return {
      or: Object.entries(idsByConstructor).map(([cstrName, ids]) => {
        const comp =
          this.field.components.find((p) => p.otherMetadata().cstr.name === cstrName) ??
          fail(`No component for ${cstrName}`);
        return this.addCondition(comp, { kind: "in", value: ids });
      }),
    };
  }

  /** Joins `other` via this poly's component for its entity, INNER when the poly is required. */
  as(other: object): object {
    return this.joinEntry(this.field.required ? "inner" : "left", other);
  }

  inner(other: object): object {
    return this.joinEntry("inner", other);
  }

  left(other: object): object {
    return this.joinEntry("left", other);
  }

  private joinEntry(kind: JoinKind, other: object): object {
    return { [kind]: requireAlias(other), on: this.eq(idColumnOf(other) as any) };
  }

  /**
   * i.e. `c.parent.in(query({ from: a, ..., select: a.id }))`: like `eq` against an alias column, the
   * subquery's select column picks the component, i.e. authors pick `parent_author_id`.
   */
  private inSubquery(values: ExprLike<any>): ExpressionCondition {
    // Read the selected expression without importing query.ts, which would create a load-order cycle.
    const select = asNode(values).subquerySelect;
    if (!(select instanceof AbstractAliasColumn)) {
      return fail(`${this.field.fieldName} is polymorphic, so \`in\` needs a subquery selecting an id or FK column`);
    }
    // The column's target entity picks the component: an id column is its own meta, an FK its other side
    const otherMeta =
      select.field.kind === "primaryKey"
        ? select.meta
        : select.field.kind === "m2o"
          ? select.field.otherMetadata()
          : fail(`${this.field.fieldName} \`in\` needs an id or FK column, got ${select.field.fieldName}`);
    const comp =
      this.field.components.find((p) => getBaseAndSelfMetas(otherMeta).includes(p.otherMetadata())) ??
      fail(`${this.field.fieldName} has no component for ${otherMeta.type}`);
    return deferredCondition((ctx) => {
      const alias = getMaybeCtiAlias(this.meta, this.field, this.meta, ctx.aliasFor(this.mgmt));
      const sub = asNode(values).toSqlBare(ctx);
      return { sql: `${alias}.${comp.columnName} IN (${sub.sql})`, bindings: sub.bindings, refs: [alias, ...sub.refs] };
    });
  }

  private addEqOrNe(kind: "eq" | "ne", value: unknown): ExpressionCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value instanceof AbstractAliasColumn) {
      // Joining through the poly, i.e. `c.parent.eq(a.id)`: the other alias's entity picks the component
      const otherMeta = value.meta;
      const comp =
        this.field.components.find((p) => getBaseAndSelfMetas(otherMeta).includes(p.otherMetadata())) ??
        fail(`${this.field.fieldName} has no component for ${otherMeta.type}`);
      return this.addCrossColumnRawCondition(comp, value, kind === "eq" ? "=" : "!=");
    } else if (isExpr(value)) {
      return fail(
        `${this.field.fieldName} is polymorphic, so it can only be compared to tagged ids or entity alias columns`,
      );
    } else if (value === null) {
      // We can AND each of the components as many conditions
      const value = kind === "eq" ? ({ kind: "is-null" } as const) : ({ kind: "not-null" } as const);
      return {
        and: this.field.components.map((p) => this.addCondition(p, value)),
      };
    } else {
      // If we have a value, we can find the component
      const comp =
        this.field.components.find(
          (p) =>
            p.otherMetadata().cstr === getConstructorFromTaggedId(maybeResolveReferenceToId(value as any) as string),
        ) || fail(`Could not find component for ${value}`);
      return this.addCondition(comp, { kind, value: value as any });
    }
  }

  /** `parent_author_id = <other id>`, i.e. `c.parent.eq(a.id)`; both aliases resolve per parse. */
  private addCrossColumnRawCondition(
    comp: PolymorphicFieldComponent,
    otherColumn: AbstractAliasColumn<any>,
    op: string,
  ): RawCondition {
    const cond: RawCondition = { kind: "raw", aliases: [], condition: "unset", pruneable: false, bindings: [] };
    return withDeferredAlias(cond, (resolve) => {
      const r1 = resolve(this.mgmt);
      const r2 = resolve(otherColumn.mgmt);
      const a1 = getMaybeCtiAlias(this.meta, this.field, r1.meta, r1.alias);
      const a2 = getMaybeCtiAlias(otherColumn.meta, otherColumn.field, r2.meta, r2.alias);
      cond.aliases = [a1, a2];
      cond.condition = `${a1}.${comp.columnName} ${op} ${a2}.${otherColumn.column.columnName}`;
    });
  }

  private addCondition(comp: PolymorphicFieldComponent, value: ParsedValueFilter<T | TaggedId>): ColumnCondition {
    const column = this.field.serde.columns.find((c) => c.columnName === comp.columnName) ?? fail("Missing column");
    const cond: ColumnCondition = {
      kind: "column",
      alias: "unset",
      column: comp.columnName,
      dbType: this.field.serde.columns[0].dbType,
      cond: mapToDb(column, value),
    };
    return withDeferredAlias(cond, (resolve) => {
      const r = resolve(this.mgmt);
      cond.alias = getMaybeCtiAlias(this.meta, this.field, r.meta, r.alias);
    });
  }
}

/**
 * Given an alias created for `meta`, adjusts the alias if it's bound to a potentially
 * different parent-/sub-meta in the join tree.
 */
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

/**
 * Marks a sugar join entry whose target is a *collection* (o2m/m2m), which filter soft-deletes like
 * em.find's "collections filter out soft-deletes, but m2o/o2o references still return them"; see
 * `QueryParser.addSoftDeleteCondition`'s call site. Reference joins and explicit joins are unmarked.
 */
export const collectionJoin: unique symbol = Symbol("joist.collectionJoin");

/** Marks a sugar m2m join entry (`a.tags.as(t)`) with its hidden join-table join; `parseQuery` expands it. */
export const m2mJoinTable: unique symbol = Symbol("joist.m2mJoinTable");

export interface M2mJoinTable {
  handle: JoinTableHandle;
  on: ExpressionCondition;
}

/** The runtime identity of an m2m join table in a query, i.e. `authors_to_tags`; it has no entity. */
export class JoinTableHandle {
  constructor(readonly joinTableName: string) {}
}

type JoinKind = "inner" | "left";

/**
 * The `as`/`inner`/`left` join factory for collection relations, i.e. `a.books.as(b)` joins with the
 * relation's default kind (LEFT: a collection may be empty) and `.inner`/`.left` override. m2o/poly
 * relations implement the same three methods directly on their column/impl classes, so `b.author`
 * stays a plain expression that is also a join factory.
 */
abstract class AbstractCollectionAlias {
  as(other: object): object {
    return this.joinEntry("left", requireAlias(other));
  }

  inner(other: object): object {
    return this.joinEntry("inner", requireAlias(other));
  }

  left(other: object): object {
    return this.joinEntry("left", requireAlias(other));
  }

  protected abstract joinEntry(kind: JoinKind, other: Alias<any>): object;
}

/** An o2m/lo2m/o2o relation: the ON is the other side's FK (an m2o or a poly component) back to our id. */
class OneToManyAliasImpl extends AbstractCollectionAlias {
  constructor(
    private proxy: any,
    private field: OneToManyField | LargeOneToManyField | OneToOneField,
  ) {
    super();
  }

  protected joinEntry(kind: JoinKind, other: Alias<any>): object {
    const { field } = this;
    const on = (other as any)[field.otherFieldName].eq(this.proxy.id);
    // Collections (o2m/lo2m) filter soft-deletes like em.find; o2o references resolve them
    const filtered = field.kind === "o2m" ? field.softDeletes !== "include" : field.kind === "lo2m";
    return { [kind]: other, on, [collectionJoin]: filtered };
  }
}

/**
 * An m2m relation, i.e. `a.tags.as(t)`.
 *
 * The entry's own ON is `t.id = att.tag_id`, and the hidden `[m2mJoinTable]` half is
 * `att.author_id = a.id`; only the target's ON references the join table, so reference pruning keeps
 * or drops the pair together. Both are deferred conditions: the join table has no entity metadata, so
 * its alias only exists once the parser registers it.
 */
class ManyToManyAliasImpl extends AbstractCollectionAlias {
  constructor(
    private proxy: any,
    private field: ManyToManyField,
  ) {
    super();
  }

  protected joinEntry(kind: JoinKind, other: Alias<any>): object {
    const { joinTableName, columnNames } = this.field;
    const [ourColumn, otherColumn] = columnNames;
    const jt = new JoinTableHandle(joinTableName);
    const ourId = this.proxy.id as AbstractAliasColumn<any>;
    const otherId = idColumnOf(other);
    const jtOn = deferredCondition((ctx) => {
      const jtAlias = ctx.aliasFor(jt);
      const id = ourId.toSql(ctx);
      return { sql: `${kqDot(jtAlias, ourColumn)} = ${id.sql}`, bindings: id.bindings, refs: id.refs };
    });
    const on = deferredCondition((ctx) => {
      const jtAlias = ctx.aliasFor(jt);
      const id = otherId.toSql(ctx);
      return { sql: `${id.sql} = ${kqDot(jtAlias, otherColumn)}`, bindings: id.bindings, refs: [...id.refs, jtAlias] };
    });
    const filtered = this.field.softDeletes !== "include";
    return {
      [kind]: other,
      on,
      [collectionJoin]: filtered,
      [m2mJoinTable]: { handle: jt, on: jtOn } satisfies M2mJoinTable,
    };
  }
}

/** Fails fast when a join factory is passed something other than an alias. */
function requireAlias(other: object): Alias<any> {
  if (!isAlias(other)) return fail(`Expected an alias to join, got ${other}`);
  return other;
}

/** The id column of a joined alias, for building sugar ON conditions. */
function idColumnOf(other: object): AbstractAliasColumn<any> {
  return (other as any).id;
}

import { groupBy } from "joist-utils";
import { Entity, IdType } from "./Entity";
import { IdOf, MaybeAbstractEntityConstructor, TaggedId } from "./EntityManager";
import {
  EntityMetadata,
  Field,
  PolymorphicField,
  PolymorphicFieldComponent,
  getBaseAndSelfMetas,
  getMetadata,
} from "./EntityMetadata";
import { ColumnCondition, ParsedValueFilter, RawCondition, makeLike, mapToDb, skipCondition } from "./QueryParser";
import { getMetadataForTable } from "./configure";
import { ExpressionCondition, ExpressionFilter, getConstructorFromTaggedId, maybeResolveReferenceToId } from "./index";
import { Column } from "./serde";
import { FieldsOf } from "./typeMap";
import { fail } from "./utils";

/** Creates an alias for complex filtering against `T`. */
export function alias<T extends Entity>(cstr: MaybeAbstractEntityConstructor<T>): Alias<T> {
  return newAliasProxy(cstr);
}

/** Creates multiple aliases for complex filtering. */
export function aliases<T extends readonly MaybeAbstractEntityConstructor<any>[]>(
  ...type: T
): { [P in keyof T]: T[P] extends MaybeAbstractEntityConstructor<infer E extends Entity> ? Alias<E> : never } {
  return type.map((t) => newAliasProxy(t)) as any;
}

export type Alias<T extends Entity> = {
  [P in keyof FieldsOf<T>]: P extends "id"
    ? EntityAlias<T>
    : FieldsOf<T>[P] extends { kind: "primitive" | "enum"; type: infer V; nullable: infer N }
      ? PrimitiveAlias<V, N extends undefined ? null : never>
      : FieldsOf<T>[P] extends { kind: "m2o"; type: infer U }
        ? EntityAlias<U>
        : FieldsOf<T>[P] extends { kind: "poly"; type: infer U extends Entity }
          ? PolyReferenceAlias<U>
          : never;
};

export interface PrimitiveAlias<V, N extends null | never> {
  eq(value: V | N | undefined | PrimitiveAlias<V, any>): ExpressionCondition;
  ne(value: V | N | undefined | PrimitiveAlias<V, any>): ExpressionCondition;
  in(values: (V | null)[] | undefined): ExpressionCondition;
  gt(value: V | undefined | PrimitiveAlias<V, any>): ExpressionCondition;
  gte(value: V | undefined | PrimitiveAlias<V, any>): ExpressionCondition;
  lt(value: V | undefined | PrimitiveAlias<V, any>): ExpressionCondition;
  lte(value: V | undefined | PrimitiveAlias<V, any>): ExpressionCondition;
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

export interface EntityAlias<T> {
  eq(value: T | IdOf<T> | null | undefined): ExpressionCondition;
  ne(value: T | IdOf<T> | null | undefined): ExpressionCondition;
  // Adding `| null` for GraphQL support
  in(value: Array<T | IdOf<T>> | null | undefined): ExpressionCondition;
  gt(value: IdOf<T> | null | undefined): ExpressionCondition;
  gte(value: IdOf<T> | null | undefined): ExpressionCondition;
  lt(value: IdOf<T> | null | undefined): ExpressionCondition;
  lte(value: IdOf<T> | null | undefined): ExpressionCondition;
  raw(exp: string, bindings: readonly any[] | undefined): ExpressionCondition;
}

const aliasMgmt = Symbol("aliasMgmt");

export function getAliasMgmt(alias: Alias<any>): AliasMgmt {
  return (alias as any)[aliasMgmt];
}

/** Management interface for `QueryParser` to set Alias's canonical alias. */
export interface AliasMgmt {
  tableName: string;
  setAlias(meta: EntityMetadata, alias: string): void;
  onBind(callback: BindCallback): void;
}

type ConditionAndAlias = { cond: ColumnCondition; field: Field & { aliasSuffix: string } };

/** Called when `em.find` binds a pre-created `alias(...)` to a concrete join-tree location. */
type BindCallback = (newMeta: EntityMetadata, newAlias: string) => void;

/** Returns the metadata for the entity that `alias` is bound to. */
export function getAliasMetadata<T extends Entity>(alias: Alias<T>): EntityMetadata<T> {
  const mgmt = (alias as any)[aliasMgmt];
  return getMetadataForTable(mgmt.tableName);
}

export function newAliasProxy<T extends Entity>(cstr: MaybeAbstractEntityConstructor<T>): Alias<T> {
  const meta = getMetadata(cstr);
  // Keeps a list of callbacks we've created for this specific proxy, so that parseFindQuery
  // can tell us, after we've been creating via the `const a = alias(Author)` command, which
  // alias we're actually bound to in the join literal.
  const callbacks: BindCallback[] = [];
  // Give QueryBuilder a hook to assign our actual alias
  const mgmt: AliasMgmt = {
    tableName: meta.tableName,
    setAlias(newMeta: EntityMetadata, newAlias: string) {
      for (const callback of callbacks) callback(newMeta, newAlias);
    },
    onBind(callback) {
      callbacks.push(callback);
    },
  };
  return new Proxy(cstr, {
    /** Create a column alias for the given field. */
    get(_, key: PropertyKey): any {
      if (key === aliasMgmt) {
        return mgmt;
      }
      const field = meta.allFields[key as string] ?? fail(`No field ${String(key)} on ${cstr.name}`);
      switch (field.kind) {
        case "primaryKey":
        case "primitive":
        case "enum":
          return new PrimitiveAliasImpl(meta, field, callbacks, field.serde!.columns[0]);
        case "m2o":
          return new EntityAliasImpl(meta, field, callbacks, field.serde!.columns[0]);
        case "poly":
          return new PolyReferenceAlias(meta, callbacks, field);
        default:
          throw new Error(`Unsupported alias field kind ${field.kind}`);
      }
    },

    has(_, key) {
      return key === aliasMgmt || key in meta.allFields;
    },
  }) as any;
}

export function isAlias(obj: any): obj is Alias<any> & { [aliasMgmt]: AliasMgmt } {
  // Oddly enough `typeof` will be a function b/c we are proxying the constructors
  return obj && typeof obj === "function" && obj[aliasMgmt] !== undefined;
}

class AbstractAliasColumn<V> {
  public constructor(
    protected meta: EntityMetadata,
    protected field: Field & { aliasSuffix: string },
    protected callbacks: BindCallback[],
    protected column: Column,
  ) {}

  protected addCondition(value: ParsedValueFilter<V>): ColumnCondition {
    const cond: ColumnCondition = {
      kind: "column",
      alias: "unset",
      column: this.column.columnName,
      dbType: this.column.dbType,
      cond: mapToDb(this.column, value),
    };
    // Track the conditions we've created to re-write the alias when we're bound
    this.callbacks.push((newMeta, newAlias) => {
      cond.alias = getMaybeCtiAlias(this.meta, this.field, newMeta, newAlias);
    });
    return cond;
  }

  protected addRawCondition(exp: string, bindings: readonly any[]): RawCondition {
    const cond = {
      kind: "raw",
      aliases: [] as string[],
      condition: `unset.${this.column.columnName} ${exp}`,
      pruneable: false,
      bindings,
    } satisfies RawCondition;
    // Update `unset` placeholder when we're bound
    this.callbacks.push((newMeta, newAlias) => {
      // Add a base-table/sub-table alias if needed
      const alias = getMaybeCtiAlias(this.meta, this.field, newMeta, newAlias);
      if (!cond.aliases.includes(alias)) cond.aliases.push(alias);
      cond.condition = cond.condition.replace("unset", alias);
    });
    return cond;
  }

  protected addCrossColumnRawCondition(otherColumn: AbstractAliasColumn<V>, op: string): RawCondition {
    const cond = {
      kind: "raw",
      aliases: [] as string[],
      condition: `unset1.${this.column.columnName} ${op} unset2.${otherColumn.column.columnName}`,
      pruneable: false,
      bindings: [],
    } satisfies RawCondition;
    // Update `unset1` placeholder when we're bound
    this.callbacks.push((newMeta, newAlias) => {
      // Add a base-table/sub-table alias if needed
      const alias = getMaybeCtiAlias(this.meta, this.field, newMeta, newAlias);
      if (!cond.aliases.includes(alias)) cond.aliases.push(alias);
      cond.condition = cond.condition.replace("unset1", alias);
    });
    // Update `unset2` placeholder when we're bound
    otherColumn.callbacks.push((newMeta, newAlias) => {
      // Add a base-table/sub-table alias if needed
      const alias = getMaybeCtiAlias(otherColumn.meta, otherColumn.field, newMeta, newAlias);
      // Kinda weird, we can get bound a few times
      if (!cond.aliases.includes(alias)) cond.aliases.push(alias);
      cond.condition = cond.condition.replace("unset2", alias);
    });
    return cond;
  }
}

class PrimitiveAliasImpl<V, N extends null | never> extends AbstractAliasColumn<V> implements PrimitiveAlias<V, N> {
  eq(value: V | N | PrimitiveAlias<V, any> | undefined): ColumnCondition | RawCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value instanceof PrimitiveAliasImpl) {
      return this.addCrossColumnRawCondition(value, "=");
    } else if (value === null) {
      return this.addCondition({ kind: "is-null" });
    } else {
      return this.addCondition({ kind: "eq", value: value as any });
    }
  }

  ne(value: V | N | undefined): ColumnCondition | RawCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value instanceof PrimitiveAliasImpl) {
      return this.addCrossColumnRawCondition(value, "!=");
    } else if (value === null) {
      return this.addCondition({ kind: "not-null" });
    } else {
      return this.addCondition({ kind: "ne", value });
    }
  }

  gt(value: V | undefined): ColumnCondition | RawCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value instanceof PrimitiveAliasImpl) {
      return this.addCrossColumnRawCondition(value, ">");
    } else {
      return this.addCondition({ kind: "gt", value });
    }
  }

  gte(value: V | undefined): ColumnCondition | RawCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value instanceof PrimitiveAliasImpl) {
      return this.addCrossColumnRawCondition(value, ">=");
    } else {
      return this.addCondition({ kind: "gte", value });
    }
  }

  lt(value: V | undefined): ColumnCondition | RawCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value instanceof PrimitiveAliasImpl) {
      return this.addCrossColumnRawCondition(value, "<");
    } else {
      return this.addCondition({ kind: "lt", value });
    }
  }

  lte(value: V | undefined): ColumnCondition | RawCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value instanceof PrimitiveAliasImpl) {
      return this.addCrossColumnRawCondition(value, "<=");
    } else {
      return this.addCondition({ kind: "lte", value });
    }
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

  in(values: (V | null)[] | undefined): ExpressionCondition {
    if (values === undefined) return skipCondition;
    if (values.includes(null)) {
      const isNull = this.addCondition({ kind: "is-null" });
      const hasValue = this.addCondition({ kind: "in", value: values.filter((v) => v !== null) });
      return { or: [isNull, hasValue] };
    } else {
      return this.addCondition({ kind: "in", value: values as V[] });
    }
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
  eq(value: T | IdOf<T> | null | undefined): ColumnCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value === null) {
      return this.addCondition({ kind: "is-null" });
    } else {
      return this.addCondition({ kind: "eq", value: value as any });
    }
  }

  ne(value: T | IdOf<T> | null | undefined): ColumnCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value === null) {
      return this.addCondition({ kind: "not-null" });
    } else {
      return this.addCondition({ kind: "ne", value: value as any });
    }
  }

  in(values: Array<T | IdOf<T>> | undefined | null): ExpressionCondition {
    if (values === undefined) {
      return skipCondition;
    } else if (values === null) {
      throw new Error("Unsupported");
    } else {
      return this.addCondition({ kind: "in", value: values as any });
    }
  }

  gt(value: IdOf<T> | null | undefined): ColumnCondition | RawCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value === null) {
      throw new Error("Unsupported");
    } else {
      return this.addCondition({ kind: "gt", value: value as any });
    }
  }

  gte(value: IdOf<T> | null | undefined): ColumnCondition | RawCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value === null) {
      throw new Error("Unsupported");
    } else {
      return this.addCondition({ kind: "gte", value: value as any });
    }
  }

  lt(value: IdOf<T> | null | undefined): ColumnCondition | RawCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value === null) {
      throw new Error("Unsupported");
    } else {
      return this.addCondition({ kind: "lt", value: value as any });
    }
  }

  lte(value: IdOf<T> | null | undefined): ColumnCondition | RawCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value === null) {
      throw new Error("Unsupported");
    } else {
      return this.addCondition({ kind: "lte", value: value as any });
    }
  }

  raw(exp: string, bindings: readonly any[] | undefined): RawCondition | ColumnCondition {
    if (bindings === undefined) return skipCondition;
    return this.addRawCondition(exp, bindings);
  }
}

class PolyReferenceAlias<T extends Entity> {
  public constructor(
    private meta: EntityMetadata,
    private callbacks: BindCallback[],
    private field: PolymorphicField & { aliasSuffix: string },
  ) {}

  eq(value: T | TaggedId | null | undefined): ExpressionFilter | ColumnCondition {
    return this.addEqOrNe("eq", value);
  }

  ne(value: T | TaggedId | null | undefined): ExpressionFilter | ColumnCondition {
    return this.addEqOrNe("ne", value);
  }

  // We required tagged ids for polys
  in(values: Array<T | TaggedId> | undefined): ExpressionFilter | ColumnCondition {
    if (values === undefined) return skipCondition;
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

  private addEqOrNe(kind: "eq" | "ne", value: T | TaggedId | null | undefined): ExpressionFilter | ColumnCondition {
    if (value === undefined) {
      return skipCondition;
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
          (p) => p.otherMetadata().cstr === getConstructorFromTaggedId(maybeResolveReferenceToId(value) as string),
        ) || fail(`Could not find component for ${value}`);
      return this.addCondition(comp, { kind, value });
    }
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
    // Track the conditions we've created to re-write the alias when we're bound
    this.callbacks.push((newMeta, newAlias) => {
      cond.alias = getMaybeCtiAlias(this.meta, this.field, newMeta, newAlias);
    });
    return cond;
  }
}

/**
 * Given an alias created for `meta`, adjusts the alias if it's bound to a potentially
 * different parent-/sub-meta in the join tree.
 */
function getMaybeCtiAlias(
  meta: EntityMetadata,
  field: Field & { aliasSuffix: string },
  newMeta: EntityMetadata,
  newAlias: string,
): string {
  // Do we have mismatched `em.find(ChildMeta)` with a `alias(BaseMeta)`? If so, the
  // usual `${field.aliasSuffix}` won't know it should have a suffix, so we need to calc it.
  if (newMeta !== meta) {
    const bases = getBaseAndSelfMetas(newMeta);
    const fieldIsFromBase = bases.includes(newMeta);
    if (fieldIsFromBase) {
      return `${newAlias}_b0`;
    }
  }
  return `${newAlias}${field.aliasSuffix}`;
}

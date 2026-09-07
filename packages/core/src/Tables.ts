import { groupBy } from "joist-utils";

// Load-order only: without this, the built cjs/esm module graph evaluates relations/* before their
// base classes exist ("Class extends value undefined"); keep it even though no symbol is imported.
import "./configure.ts";
import { getMaybeCtiAlias } from "./Aliases.ts";
import { type Entity, type IdType } from "./Entity.ts";
import { type IdOf, type MaybeAbstractEntityConstructor, type TaggedId } from "./EntityManager.ts";
import {
  type EntityMetadata,
  type Field,
  type LargeOneToManyField,
  type ManyToManyField,
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
  type ExprOutputType,
  type InnerJoin,
  type LeftJoin,
  type SqlFragment,
  asNode,
  canonicalDbType,
  deferredCondition,
  isExpr,
  skipCondition,
  withDeferredAlias,
} from "./Expr.ts";
import { type ExpressionCondition, getConstructorFromTaggedId, maybeResolveReferenceToId } from "./index.ts";
import { toIdOf } from "./keys.ts";
import { kqDot } from "./keywords.ts";
import { type ColumnCondition, type ParsedValueFilter, type RawCondition, makeLike, mapToDb } from "./QueryParser.ts";
import { type Column, KeySerde, PolymorphicKeySerde } from "./serde.ts";
import { type ColumnsOf, type FieldsOf, type RootTypeNameOf } from "./typeMap.ts";
import { fail } from "./utils.ts";

/** Creates physical column expressions and relationship joins for `T`. */
export function table<T extends Entity>(cstr: MaybeAbstractEntityConstructor<T>): Table<T>;
/**
 * Creates a table with an explicit type-level name, i.e. `table(Author, "m")` for a self-join.
 *
 * The name is the table's source key in `em.query`: two bare `table(Author)`s share the key `"Author"`,
 * so a left-joined mentor would also mark the mentee's columns nullable; a named alias has its own key.
 */
export function table<T extends Entity, Name extends string>(
  cstr: MaybeAbstractEntityConstructor<T>,
  name: Name,
): Table<T, Name>;
export function table<T extends Entity>(cstr: MaybeAbstractEntityConstructor<T>, _name?: string): Table<T, any> {
  // The name only exists at the type level; the SQL alias is still assigned by the query parser
  return newTableProxy(cstr);
}

/** Creates multiple physical table handles. */
export function tables<T extends readonly MaybeAbstractEntityConstructor<any>[]>(
  ...type: T
): { [P in keyof T]: T[P] extends MaybeAbstractEntityConstructor<infer E extends Entity> ? Table<E> : never } {
  return type.map((t) => newTableProxy(t)) as any;
}

/**
 * The runtime management interface plus phantom type information for `em.query`.
 *
 * `__entity` lets `QueryRow` recover `T` for entity mode (you cannot `infer T` back out of a mapped
 * type), and `__name` is the table's source key (see `Expr`).
 */
export interface TableBrand<T, Name extends string> extends TableMgmt {
  readonly __entity: T;
  readonly __name: Name;
}

/**
 * A physical table for `T`: one expression per SQL column, with relationship names as join factories.
 * Selecting the table itself retains entity hydration; selecting columns returns decoded SQL values.
 *
 * `Name` is the table's type-level source key, defaulting to the entity's root type name (see
 * `RootTypeNameOf`); `table(Author, "m")` gives a self-join table its own key.
 */
export type Table<T extends Entity, Name extends string = RootTypeNameOf<T>> = {
  readonly [tableMgmt]: TableBrand<T, Name>;
} & {
  [P in keyof ColumnsOf<T>]: P extends "id"
    ? EntityColumn<T, never, Name>
    : ColumnsOf<T>[P] extends { kind: "primitive" | "enum"; type: infer V; nullable: infer N }
      ? PrimitiveColumn<V, N extends true ? null : never, Name>
      : ColumnsOf<T>[P] extends { kind: "m2o"; type: infer U extends Entity; nullable: infer N }
        ? ReferenceColumn<U, N extends true ? null : never, Name>
        : never;
} & {
  [
    P in keyof FieldsOf<T> as P extends keyof ColumnsOf<T>
      ? never
      : FieldsOf<T>[P] extends { kind: "m2o" | "poly" | "o2m" | "lo2m" | "m2m" | "o2o" }
        ? P
        : never
  ]: FieldsOf<T>[P] extends { kind: "m2o"; type: infer U extends Entity; nullable: infer N }
    ? ReferenceJoin<U, N extends undefined ? null : never>
    : FieldsOf<T>[P] extends { kind: "poly"; type: infer U extends Entity; nullable: infer N }
      ? PolyReference<U, N extends undefined ? null : never>
      : FieldsOf<T>[P] extends { kind: "o2m" | "lo2m" | "m2m" | "o2o"; type: infer U extends Entity }
        ? CollectionJoin<U>
        : never;
};

/** A relationship join factory, without a selectable FK expression. */
export interface ReferenceJoin<U extends Entity, N extends null | never> {
  as<A extends TableFor<U>>(other: A): [N] extends [never] ? InnerJoin<A> : LeftJoin<A>;
  inner<A extends TableFor<U>>(other: A): InnerJoin<A>;
  left<A extends TableFor<U>>(other: A): LeftJoin<A>;
}

/** Any table whose entity is (a subtype of) `U`, i.e. what a relation join factory accepts. */
export type TableFor<U> = { readonly [tableMgmt]: TableBrand<U, string> };

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
export interface CollectionJoin<U extends Entity> {
  as<A extends TableFor<U>>(other: A): LeftJoin<A>;
  inner<A extends TableFor<U>>(other: A): InnerJoin<A>;
  left<A extends TableFor<U>>(other: A): LeftJoin<A>;
}

/**
 * A physical FK column expression (`b.author_id` selects/compares the FK) plus a join factory
 * (`b.author_id.as(a)` joins). The default join kind follows physical column nullability:
 * a NOT NULL FK is INNER, a nullable one is LEFT, and the row type reflects it.
 */
export interface ReferenceColumn<U extends Entity, N extends null | never, Src extends string>
  extends EntityColumn<U, N, Src>, ReferenceJoin<U, N> {}

/**
 * A polymorphic reference: condition methods (each resolving the component column from the value), plus
 * a join factory that picks the component from the argument's entity, i.e. `c.parent.as(a)` joins
 * through `parent_author_id`, like an explicit join with `on: c.parent.eq(a.id)`.
 */
export interface PolyReference<U extends Entity, N extends null | never> extends ReferenceJoin<U, N> {
  eq(value: U | TaggedId | ExprLike<IdOf<U> | null> | null | undefined): ExpressionCondition;
  ne(value: U | TaggedId | ExprLike<IdOf<U> | null> | null | undefined): ExpressionCondition;
  in(values: Array<U | TaggedId> | ExprLike<IdOf<U> | null> | undefined): ExpressionCondition;
}

export interface PrimitiveColumn<V, N extends null | never, Src extends string = string> extends Expr<V | N, Src> {
  eq(value: V | ExprLike<V | N> | N | undefined): ExpressionCondition;
  ne(value: V | ExprLike<V | N> | N | undefined): ExpressionCondition;
  in(values: readonly (V | null)[] | ExprLike<V | null> | undefined): ExpressionCondition;
  nin(values: readonly (V | null)[] | ExprLike<V | null> | undefined): ExpressionCondition;
  gt(value: V | ExprLike<V | N> | undefined): ExpressionCondition;
  gte(value: V | ExprLike<V | N> | undefined): ExpressionCondition;
  lt(value: V | ExprLike<V | N> | undefined): ExpressionCondition;
  lte(value: V | ExprLike<V | N> | undefined): ExpressionCondition;
  like(value: V | undefined): ExpressionCondition;
  ilike(value: V | undefined): ExpressionCondition;
  search(value: V | undefined): ExpressionCondition;
  between(v1: V | undefined, v2: V | undefined): ExpressionCondition;
  // need to move to ArrayColumn
  // ...added the `string` to support jsonb contains like `WHERE profile @> '{"age": 25}'`
  // Ideally this would go in a JsonbColumn
  contains(value: string | V | PrimitiveColumn<V, any> | N | undefined): ExpressionCondition;
  ncontains(value: string | V | PrimitiveColumn<V, any> | N | undefined): ExpressionCondition;
  overlaps(value: V | PrimitiveColumn<V, any> | N | undefined): ExpressionCondition;
  noverlaps(value: V | PrimitiveColumn<V, any> | N | undefined): ExpressionCondition;

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

export interface EntityColumn<T, N extends null | never = never, Src extends string = string> extends Expr<
  IdOf<T> | N,
  Src
> {
  eq(value: T | IdOf<T> | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition;
  ne(value: T | IdOf<T> | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition;
  // Adding `| null` for GraphQL support
  in(value: readonly (T | IdOf<T> | null)[] | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition;
  nin(value: readonly (T | IdOf<T> | null)[] | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition;
  gt(value: IdOf<T> | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition;
  gte(value: IdOf<T> | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition;
  lt(value: IdOf<T> | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition;
  lte(value: IdOf<T> | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition;
  raw(exp: string, bindings: readonly any[] | undefined): ExpressionCondition;
}

export const tableMgmt = Symbol("tableMgmt");

export function getTableMgmt(table: TableFor<unknown>): TableMgmt {
  return table[tableMgmt];
}

/** The identity SQL queries bind a table by, plus its original entity metadata. */
export interface TableMgmt {
  tableName: string;
  /**
   * The metadata this table was created with, i.e. `table(TaskNew)` keeps `taskNewMeta`.
   *
   * It cannot be re-derived from `tableName`: STI subtypes share their base's table (`Task`, `TaskNew`,
   * and `TaskOld` are all `tasks`), so a `getMetadataForTable("tasks")` lookup can only return the base
   * `Task`, and the alias would lose its subtype identity (its discriminator filter and its constructor
   * for entity-mode hydration).
   */
  meta: EntityMetadata;
}

/** Returns the metadata for the entity that `table` is bound to. */
export function getTableMetadata<T extends Entity>(table: TableFor<T>): EntityMetadata<T> {
  const mgmt = table[tableMgmt];
  return mgmt.meta as EntityMetadata<T>;
}

export function newTableProxy<T extends Entity>(cstr: MaybeAbstractEntityConstructor<T>): Table<T> {
  const meta = getMetadata(cstr);
  // The identity SQL queries bind to a source, retaining STI subtype metadata.
  const mgmt: TableMgmt = { tableName: meta.tableName, meta };
  const proxy: any = new Proxy(cstr, {
    /** Create a physical column expression or a relation join factory. */
    get(_, key: PropertyKey): any {
      if (key === tableMgmt) {
        return mgmt;
      }
      if (typeof key !== "string") return undefined;
      const descriptor = Object.hasOwn(meta.columns, key) ? meta.columns[key] : undefined;
      if (descriptor) {
        const field = meta.allFields[descriptor.fieldName] ?? fail(`No field ${descriptor.fieldName} on ${cstr.name}`);
        const column =
          field.serde?.columns.find((c) => c.columnName === key) ?? fail(`No column ${key} on ${cstr.name}`);
        return field.kind === "m2o" || field.kind === "poly"
          ? new EntityColumnImpl(meta, field, column, mgmt)
          : new PrimitiveColumnImpl(meta, field, column, mgmt);
      }
      const field = meta.allFields[key as string] ?? fail(`No field ${String(key)} on ${cstr.name}`);
      switch (field.kind) {
        case "m2o":
          return new ReferenceJoinImpl(new EntityColumnImpl(meta, field, field.serde!.columns[0], mgmt));
        case "poly":
          return new PolyReferenceImpl(meta, mgmt, field);
        case "o2m":
        case "o2o":
        case "lo2m":
          return new OneToManyJoinImpl(proxy, field);
        case "m2m":
          return new ManyToManyJoinImpl(proxy, field);
        default:
          throw new Error(`Unsupported table field kind ${field.kind}`);
      }
    },

    has(_, key) {
      return (
        key === tableMgmt ||
        (typeof key === "string" && (Object.hasOwn(meta.columns, key) || isRelation(meta.allFields[key])))
      );
    },
  });
  return proxy;
}

export function isTable(obj: unknown): obj is Table<any, any> {
  // Oddly enough `typeof` will be a function b/c we are proxying the constructors
  return typeof obj === "function" && tableMgmt in obj;
}

/**
 * A physical table column implements `Expr`: it renders as `alias."column"`, decodes result
 * values through the field's serde, and inherits aggregate methods from `BaseExpr`.
 */
class TableColumn<V> extends BaseExpr {
  public constructor(
    readonly meta: EntityMetadata,
    readonly field: Field & { aliasSuffix: string },
    readonly column: Column,
    readonly mgmt: TableMgmt,
  ) {
    super();
  }

  /** Author.id, Book.author_id, and Comment.parent_author_id use the same Author ID domain. */
  get outputType(): ExprOutputType | undefined {
    const idMeta = this.idMetadata;
    // Built-in poly components are plain columns, not KeySerde instances, but share its ID codec.
    if (idMeta && this.field.serde?.constructor === PolymorphicKeySerde) {
      return {
        dbType: canonicalDbType(this.column.dbType),
        domain: `key:${idMeta.tagName}`,
        idMeta,
        arrayElementSafe: true,
      };
    }
    const outputType = this.column.outputType;
    if (!outputType || !(this.column instanceof KeySerde)) return outputType;
    return idMeta ? { ...outputType, idMeta } : undefined;
  }

  get sqlNullable(): boolean | undefined {
    // Entity requiredness differs from physical NOT NULL for derived and STI fields.
    // A required poly still has nullable component FKs: only one target is set on each row.
    return this.field.kind === "poly" ? true : this.column.sqlNullable;
  }

  get sqlSource(): object {
    return this.mgmt;
  }

  toSql(ctx: ExprContext): SqlFragment {
    const alias = ctx.aliasFor(this.mgmt);
    const ctiAlias = getMaybeCtiAlias(this.meta, this.field, this.meta, alias);
    return { sql: kqDot(ctiAlias, this.column.columnName), bindings: [], refs: [alias] };
  }

  /** Decodes result-set values with public PK/FK ids, while hydration keeps internal tagged ids. */
  decode(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (this.column instanceof KeySerde || this.field.serde instanceof PolymorphicKeySerde) {
      const idMeta = this.idMetadata;
      if (idMeta) return toIdOf(idMeta, this.column.mapFromDb(value) as TaggedId | undefined);
    }
    return this.column.mapFromDb(value);
  }

  encode(value: unknown): unknown {
    return this.column.mapToDb(value);
  }

  /** Identifies the ID domain of a primary key, FK, or physical polymorphic component. */
  get idMetadata(): EntityMetadata | undefined {
    return this.field.kind === "primaryKey"
      ? this.meta
      : this.field.kind === "m2o"
        ? this.field.otherMetadata()
        : this.field.kind === "poly"
          ? this.field.components.find((c) => c.columnName === this.column.columnName)?.otherMetadata()
          : undefined;
  }

  protected addCondition(value: ParsedValueFilter<V>): ColumnCondition {
    const cond: ColumnCondition = {
      kind: "column",
      alias: "unset",
      column: this.column.columnName,
      dbType: this.column.dbType,
      cond: mapToDb(this.column, value),
    };
    return withDeferredAlias(cond, (resolve, cond) => {
      const r = resolve(this.mgmt);
      cond.alias = getMaybeCtiAlias(this.meta, this.field, r.meta, r.alias);
    });
  }

  protected addRawCondition(exp: string, bindings: readonly any[]): RawCondition {
    const cond: RawCondition = { kind: "raw", aliases: [], condition: "unset", pruneable: false, bindings };
    return withDeferredAlias(cond, (resolve, cond) => {
      const r = resolve(this.mgmt);
      const alias = getMaybeCtiAlias(this.meta, this.field, r.meta, r.alias);
      cond.aliases = [alias];
      cond.condition = `${alias}.${this.column.columnName} ${exp}`;
    });
  }

  /**
   * Compares this column to another expression.
   *
   * Another table column uses a deferred column condition. Other expressions (aggregates, subquery
   * columns, and `sql` templates) use the expression context to render their complete SQL.
   * Negated array operators wrap the complete comparison in NOT.
   */
  protected compareToExpr(op: string, value: ExprLike<any>, negate = false): ExpressionCondition {
    if (negate) {
      return deferredCondition((ctx) => {
        const comparison = ctx.conditionToSql(this.compareToExpr(op, value))!;
        return { ...comparison, sql: `NOT (${comparison.sql})` };
      });
    }
    if (value instanceof TableColumn) {
      return newCrossColumnCondition(this.meta, this.field, this.mgmt, this.column.columnName, value, op);
    }
    return this.compare(op, value);
  }
}

class PrimitiveColumnImpl<V, N extends null | never> extends TableColumn<V> implements PrimitiveColumn<V, N> {
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
  contains(v1: string | V | PrimitiveColumn<V, any> | N | undefined): ExpressionCondition {
    if (v1 === undefined) return skipCondition;
    if (isExpr(v1)) return this.compareToExpr("@>", v1);
    return this.addCondition({ kind: "contains", value: v1 as any });
  }

  // V will already be an array
  ncontains(v1: string | V | PrimitiveColumn<V, any> | N | undefined): ExpressionCondition {
    if (v1 === undefined) return skipCondition;
    if (isExpr(v1)) return this.compareToExpr("@>", v1, true);
    return this.addCondition({ kind: "ncontains", value: v1 as any });
  }

  // V will already be an array
  overlaps(v1: V | PrimitiveColumn<V, any> | N | undefined): ExpressionCondition {
    if (v1 === undefined) return skipCondition;
    if (isExpr(v1)) return this.compareToExpr("&&", v1);
    return this.addCondition({ kind: "overlaps", value: v1 as any });
  }

  noverlaps(v1: V | PrimitiveColumn<V, any> | N | undefined): ExpressionCondition {
    if (v1 === undefined) return skipCondition;
    if (isExpr(v1)) return this.compareToExpr("&&", v1, true);
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

class EntityColumnImpl<T> extends TableColumn<IdType> implements EntityColumn<T> {
  eq(value: T | IdOf<T> | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition {
    if (value === undefined) return skipCondition;
    if (value === null) return this.addCondition({ kind: "is-null" });
    if (isExpr(value)) return this.compareToExpr("=", value);
    return this.addCondition({ kind: "eq", value: value as any });
  }

  ne(value: T | IdOf<T> | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition {
    if (value === undefined) return skipCondition;
    if (value === null) return this.addCondition({ kind: "not-null" });
    if (isExpr(value)) return this.compareToExpr("!=", value);
    return this.addCondition({ kind: "ne", value: value as any });
  }

  in(values: readonly (T | IdOf<T> | null)[] | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition {
    if (values === undefined) {
      return skipCondition;
    } else if (values === null) {
      throw new Error("Unsupported");
    } else if (isExpr(values)) {
      return this.inList("IN", values);
    } else if (values.includes(null)) {
      // Like `PrimitiveColumn.in`, split `[a1, null]` into `IS NULL OR IN (...)`
      const isNull = this.addCondition({ kind: "is-null" });
      const hasValue = this.addCondition({ kind: "in", value: values.filter((v) => v !== null) as any });
      return { or: [isNull, hasValue] };
    } else {
      return this.addCondition({ kind: "in", value: values as any });
    }
  }

  nin(values: readonly (T | IdOf<T> | null)[] | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition {
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

  gt(value: IdOf<T> | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition {
    return this.compareId(">", "gt", value);
  }

  gte(value: IdOf<T> | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition {
    return this.compareId(">=", "gte", value);
  }

  lt(value: IdOf<T> | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition {
    return this.compareId("<", "lt", value);
  }

  lte(value: IdOf<T> | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition {
    return this.compareId("<=", "lte", value);
  }

  raw(exp: string, bindings: readonly any[] | undefined): RawCondition | ColumnCondition {
    if (bindings === undefined) return skipCondition;
    return this.addRawCondition(exp, bindings);
  }

  /** Joins `other` via this FK, INNER for a required reference and LEFT for a nullable one. */
  as(other: object): object {
    return this.joinEntry(this.sqlNullable === false ? "inner" : "left", other);
  }

  inner(other: object): object {
    return this.joinEntry("inner", other);
  }

  left(other: object): object {
    return this.joinEntry("left", other);
  }

  private joinEntry(kind: JoinKind, other: object): object {
    return { [kind]: requireTable(other), on: this.eq(idColumnOf(other)) };
  }

  private compareId(op: string, kind: "gt" | "gte" | "lt" | "lte", value: unknown): ExpressionCondition {
    if (value === undefined) return skipCondition;
    if (value === null) throw new Error("Unsupported");
    if (isExpr(value)) return this.compareToExpr(op, value);
    return this.addCondition({ kind, value: value as any });
  }
}

class PolyReferenceImpl<T extends Entity> {
  public constructor(
    private meta: EntityMetadata,
    private mgmt: TableMgmt,
    private field: PolymorphicField & { aliasSuffix: string },
  ) {}

  /** Compares to a tagged id, an entity, or another table's id column, which picks the component (`c.parent.eq(a.id)`). */
  eq(value: T | TaggedId | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition {
    return this.addEqOrNe("eq", value);
  }

  ne(value: T | TaggedId | ExprLike<IdOf<T> | null> | null | undefined): ExpressionCondition {
    return this.addEqOrNe("ne", value);
  }

  // We required tagged ids for polys
  in(values: Array<T | TaggedId> | ExprLike<IdOf<T> | null> | undefined): ExpressionCondition {
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
    return { [kind]: requireTable(other), on: this.eq(idColumnOf(other) as any) };
  }

  /**
   * i.e. `c.parent.in(query({ from: a, ..., select: a.id }))`: like `eq` against a table column, the
   * subquery's agreed ID domain picks the component, i.e. authors pick `parent_author_id`.
   */
  private inSubquery(values: ExprLike<any>): ExpressionCondition {
    // Only actual subqueries expose this getter; importing query.ts would create a load-order cycle.
    const selected = asNode(values).subquerySelect;
    const outputType = selected?.outputType;
    let otherMeta = outputType?.idMeta;
    if (!otherMeta) {
      // Ordinary reads can select an unknown key serde. Compounds validate codecs before exposing a select.
      if (!outputType && selected instanceof TableColumn) {
        otherMeta = selected.idMetadata;
      }
      if (!otherMeta) {
        return fail(
          selected instanceof TableColumn
            ? `${this.field.fieldName} \`in\` needs an id or FK column, got ${selected.field.fieldName}`
            : `${this.field.fieldName} is polymorphic, so \`in\` needs a subquery selecting an id or FK column`,
        );
      }
    }
    const comp =
      this.field.components.find((p) => getBaseAndSelfMetas(otherMeta).includes(p.otherMetadata())) ??
      fail(`${this.field.fieldName} has no component for ${otherMeta.type}`);
    return deferredCondition((ctx) => {
      const alias = getMaybeCtiAlias(this.meta, this.field, this.meta, ctx.aliasFor(this.mgmt));
      const sub = asNode(values).toSqlBare(ctx);
      return { sql: `${alias}.${comp.columnName} IN (${sub.sql})`, bindings: sub.bindings, refs: [alias, ...sub.refs] };
    });
  }

  private addEqOrNe(
    kind: "eq" | "ne",
    value: T | TaggedId | ExprLike<IdOf<T> | null> | null | undefined,
  ): ExpressionCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value instanceof TableColumn) {
      // Joining through the poly, i.e. `c.parent.eq(a.id)`: the other table column's ID domain picks the component
      const otherMeta = value.idMetadata ?? fail(`${this.field.fieldName} needs an id or FK column`);
      const comp =
        this.field.components.find((p) => getBaseAndSelfMetas(otherMeta).includes(p.otherMetadata())) ??
        fail(`${this.field.fieldName} has no component for ${otherMeta.type}`);
      return newCrossColumnCondition(
        this.meta,
        this.field,
        this.mgmt,
        comp.columnName,
        value,
        kind === "eq" ? "=" : "!=",
      );
    } else if (isExpr(value)) {
      return fail(
        `${this.field.fieldName} is polymorphic, so it can only be compared to tagged ids or entity table columns`,
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
      dbType: column.dbType,
      cond: mapToDb(column, value),
    };
    return withDeferredAlias(cond, (resolve, cond) => {
      const r = resolve(this.mgmt);
      cond.alias = getMaybeCtiAlias(this.meta, this.field, r.meta, r.alias);
    });
  }
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
 * relations implement the same three methods on their join factories. Physical FKs such as
 * `b.author_id` are expressions that also expose a join factory.
 */
abstract class CollectionJoinImpl {
  as(other: object): object {
    return this.joinEntry("left", requireTable(other));
  }

  inner(other: object): object {
    return this.joinEntry("inner", requireTable(other));
  }

  left(other: object): object {
    return this.joinEntry("left", requireTable(other));
  }

  protected abstract joinEntry(kind: JoinKind, other: TableFor<Entity>): object;
}

/** An o2m/lo2m/o2o relation: the ON is the other side's FK (an m2o or a poly component) back to our id. */
class OneToManyJoinImpl extends CollectionJoinImpl {
  constructor(
    private proxy: any,
    private field: OneToManyField | LargeOneToManyField | OneToOneField,
  ) {
    super();
  }

  protected joinEntry(kind: JoinKind, other: TableFor<Entity>): object {
    const { field } = this;
    const otherMeta = getTableMetadata(other);
    const inverse = otherMeta.allFields[field.otherFieldName];
    const column =
      inverse.kind === "poly"
        ? (other as any)[field.otherFieldName]
        : (other as any)[inverse.serde!.columns[0].columnName];
    const on = column.eq(this.proxy.id);
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
class ManyToManyJoinImpl extends CollectionJoinImpl {
  constructor(
    private proxy: any,
    private field: ManyToManyField,
  ) {
    super();
  }

  protected joinEntry(kind: JoinKind, other: TableFor<Entity>): object {
    const { joinTableName, columnNames } = this.field;
    const [ourColumn, otherColumn] = columnNames;
    const jt = new JoinTableHandle(joinTableName);
    const ourId = idColumnOf(this.proxy);
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

/** Compares columns with per-parse aliases, i.e. `parent_author_id = <other id>` for `c.parent.eq(a.id)`. */
function newCrossColumnCondition(
  meta: EntityMetadata,
  field: Field & { aliasSuffix: string },
  mgmt: TableMgmt,
  columnName: string,
  otherColumn: TableColumn<unknown>,
  op: string,
): RawCondition {
  const cond: RawCondition = { kind: "raw", aliases: [], condition: "unset", pruneable: false, bindings: [] };
  return withDeferredAlias(cond, (resolve, cond) => {
    const r1 = resolve(mgmt);
    const r2 = resolve(otherColumn.mgmt);
    const a1 = getMaybeCtiAlias(meta, field, r1.meta, r1.alias);
    const a2 = getMaybeCtiAlias(otherColumn.meta, otherColumn.field, r2.meta, r2.alias);
    cond.aliases = [a1, a2];
    cond.condition = `${a1}.${columnName} ${op} ${a2}.${otherColumn.column.columnName}`;
  });
}

/** Fails fast when a join factory is passed something other than a table. */
function requireTable(other: object): TableFor<Entity> {
  if (!isTable(other)) return fail(`Expected a table to join, got ${other}`);
  return other;
}

/** The id column of a joined table, for building sugar ON conditions. */
function idColumnOf(other: object): TableColumn<unknown> {
  return (other as any).id;
}

/** Keeps relation names join-only; physical FK columns retain expression methods. */
class ReferenceJoinImpl {
  constructor(private column: EntityColumnImpl<unknown>) {}

  as(other: object): object {
    return this.column.field.required ? this.column.inner(other) : this.column.left(other);
  }

  inner(other: object): object {
    return this.column.inner(other);
  }

  left(other: object): object {
    return this.column.left(other);
  }
}

/** Identifies domain relationship keys exposed alongside physical columns. */
function isRelation(field: Field | undefined): boolean {
  return field !== undefined && ["m2o", "poly", "o2m", "lo2m", "m2m", "o2o"].includes(field.kind);
}

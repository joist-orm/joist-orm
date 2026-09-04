import { AliasAssigner } from "./AliasAssigner.ts";
import {
  type Alias,
  type AliasBrand,
  type AliasMgmt,
  JoinTableHandle,
  type M2mJoinTable,
  aliasMgmt,
  collectionJoin,
  getAliasMetadata,
  getAliasMgmt,
  isAlias,
  m2mJoinTable,
} from "./Aliases.ts";
import { ConditionBuilder } from "./ConditionBuilder.ts";
import { buildWhereClause } from "./drivers/buildUtils.ts";
import { type Entity } from "./Entity.ts";
import { type ExpressionCondition, type ExpressionFilter } from "./EntityFilter.ts";
import { type EntityMetadata, getBaseMeta } from "./EntityMetadata.ts";
import {
  BaseExpr,
  type Expr,
  type ExprBrand,
  type ExprContext,
  type ExprLike,
  type InnerJoin,
  type LeftJoin,
  RefExpr,
  type SqlFragment,
  TemplateExpr,
  asNode,
  deferredCondition,
  exprBrand,
  isExpr,
  resolveDeferredConditions,
} from "./Expr.ts";
import { kq, kqStar, safeKq } from "./keywords.ts";
import { deepFindConditions } from "./QueryParser.pruning.ts";
import {
  type ColumnCondition,
  type ParsedExpressionFilter,
  type ParsedFindQuery,
  addTablePerClassJoinsAndClassTag,
  filterSoftDeletes,
  stiSubtypeFilter,
} from "./QueryParser.ts";
import { fail } from "./utils.ts";

/**
 * `em.query`: SQL-shaped queries as plain object literals.
 *
 * A query is data, a `Query<S, J>` POJO, `{ from, join, where, groupBy, having, select, orderBy, ... }`
 * in SQL evaluation order:
 *
 *   const [a, b] = aliases(Author, Book);
 *   const bookStats = query({ from: b, groupBy: [b.author], select: { authorId: b.author, n: b.id.count() } });
 *   const rows = await em.query({
 *     from: a,
 *     join: [{ left: bookStats, on: bookStats.authorId.eq(a.id) }],
 *     select: { name: a.firstName, n: bookStats.n },
 *     orderBy: { n: "DESC" },
 *   });
 *   // rows: { name: string; n: number | null }[]   (null because of the LEFT join)
 *
 * `em.query(pojo)` runs it. `select` decides the row type: a bare alias returns entities, a
 * `{ key: expr }` object returns typed POJOs, a bare subquery returns that subquery's rows.
 *
 * `query(pojo)` turns the *same* POJO into a value: a derived table with typed columns, a scalar
 * expression, or an entity list. It is the one non-POJO step, and the subquery analog of `alias(Author)`:
 * to reference a query's columns, the outer query needs *values* for them, and no POJO can manufacture
 * values keyed off its own `select` keys.
 *
 * `alias()`/`aliases()` and `query()` are the only free functions a query needs, plus the `sql` tagged
 * template as the escape hatch for SQL with no modeled shape. Everything else is in-DSL: join kinds and
 * sort directions are keyword keys (`{ left: b, on }`, `{ desc: x }`), SQL functions are methods on
 * expressions (`b.id.count()`, `b.title.max()`, `x.coalesce(0)`), conditions are methods
 * (`a.age.gte(18)`), and pruning is `undefined`: an `undefined` condition drops out, and a join nothing
 * references anymore drops with it (see "Pruning" below).
 *
 * User documentation: `docs/src/content/docs/features/queries-raw.md`.
 */

// =====================================================================================================
// Sources, joins, clauses
// =====================================================================================================

export const subqueryBrand: unique symbol = Symbol("joist.subquery");
export const entityQueryBrand: unique symbol = Symbol("joist.entityQuery");

/** Phantom type information carried by a table-shaped subquery. */
export interface SubqueryBrand<R, Name extends string> {
  readonly __row: R;
  readonly __name: Name;
}

/** Anything that can be a source or be joined: an entity alias or a table-shaped subquery. */
export type QuerySource =
  | { readonly [aliasMgmt]: AliasBrand<any, string> }
  | { readonly [subqueryBrand]: SubqueryBrand<any, string> };

/**
 * A join entry (see `InnerJoin`/`LeftJoin` in `Expr.ts`): the expanded `{ inner: b, on }` form, or the
 * entry a relation join factory returns (`a.books.as(b)`); joins to a subquery are always the expanded
 * form, since a subquery has no FK metadata.
 */
export type QueryJoin = InnerJoin<QuerySource> | LeftJoin<QuerySource>;
export type QueryJoins = readonly (QueryJoin | undefined)[];

/**
 * One order-by entry: the direction is the key, the expression is the value, mirroring how `em.find`
 * puts the field name as the key and `"ASC" | "DESC"` as the value. `never` on the other key keeps an
 * entry to one direction, the same trick `ExpressionFilter` uses for `and`/`or`. `nulls` is
 * `NULLS FIRST/LAST`.
 */
export type QueryOrderBy = (
  | { readonly asc: ExprLike<any>; readonly desc?: never }
  | { readonly desc: ExprLike<any>; readonly asc?: never }
) & { readonly nulls?: "first" | "last" };

export type OrderByDirection =
  | "ASC"
  | "DESC"
  | "ASC NULLS FIRST"
  | "ASC NULLS LAST"
  | "DESC NULLS FIRST"
  | "DESC NULLS LAST";

/**
 * The keyed `orderBy` form, mirroring `em.find`'s `orderBy: { firstName: "ASC" }`.
 *
 * The keys are the keys of a POJO/subquery `select` (rendered as SQL output-column names, so ordering
 * by an aggregate does not repeat its expression), or the entity's sortable fields in entity mode.
 * An `undefined` direction prunes the entry, like any other condition. For expressions that are not
 * in `select`, use the array form's `{ asc: expr }` / `{ desc: expr }` entries.
 */
export type OrderByKeys<S> = S extends { readonly [aliasMgmt]: { readonly __entity: infer T } }
  ? T extends Entity
    ? { readonly [K in keyof Alias<T> as Alias<T>[K] extends ExprLike<any> ? K : never]?: OrderByDirection | undefined }
    : never
  : S extends { readonly [exprBrand]: any }
    ? never
    : { readonly [K in keyof S & string]?: OrderByDirection | undefined };

/** The three select shapes: entity mode, single-expression mode (scalar/list subqueries), and POJO mode. */
export type QuerySelect = QuerySource | ExprLike<any> | Record<string, ExprLike<any>>;

/**
 * Everything but the source, in SQL evaluation order: FROM/JOIN, WHERE, GROUP BY, HAVING, SELECT,
 * ORDER BY, LIMIT.
 *
 * `S` and `J` are generic so callers keep the literal shape of `select` and `join`; the defaults let
 * a standalone object use `satisfies Query` (or `satisfies Clauses` for a source-less fragment).
 */
export interface Clauses<S extends QuerySelect = QuerySelect, J extends QueryJoins = QueryJoins> {
  join?: J;
  /** An `{ and: [...] }` / `{ or: [...] }` filter, or a single bare condition, i.e. `where: a.age.gte(18)`. */
  where?: ExpressionCondition;
  groupBy?: readonly ExprLike<any>[];
  having?: ExpressionCondition;
  select: S;
  orderBy?: readonly (QueryOrderBy | undefined)[] | OrderByKeys<S>;
  limit?: number;
  offset?: number;
  distinct?: boolean;
  /** Defaults to true. `false` keeps every join, em.find's opt-out. */
  pruneJoins?: boolean;
  /**
   * Defaults to `"exclude"`, em.find's rule: a soft-deletable entity in `from` gains a
   * `deleted_at IS NULL` condition in WHERE, and a joined one gains it in its join's ON (so a LEFT
   * join nulls its columns out instead of dropping rows). `"include"` turns the injection off for
   * this query; subqueries read their own key.
   */
  softDeletes?: "include" | "exclude";
}

/** A whole query: `Clauses` plus its source. `query(q)` turns it into a value; `em.query(q)` runs it. */
export interface Query<S extends QuerySelect = QuerySelect, J extends QueryJoins = QueryJoins> extends Clauses<S, J> {
  from: QuerySource;
}

// =====================================================================================================
// Result-row types
// =====================================================================================================

/** The type-level name of an alias or subquery, i.e. `"Author"` or `"book_stats"`. */
export type NameOf<A> = A extends { readonly [aliasMgmt]: { readonly __name: infer N } }
  ? N
  : A extends { readonly [subqueryBrand]: { readonly __name: infer N } }
    ? N
    : never;

/** The names of every alias that was LEFT JOINed; `X` is a naked type parameter so this distributes. */
type LeftJoined<X> = X extends LeftJoin<infer A> ? NameOf<A> : never;

/**
 * Asks: is this expression's source key among the LEFT-joined sources in this query's join list? If
 * yes, the value can be `null`, so `R` becomes `R | null`; if no, `R` is unchanged.
 *
 * I.e. `MaybeNull<number, "book_stats", [LeftJoin<typeof bookStats>]>` is `number | null`,
 * because `book_stats` is in `LeftJoined<J[number]>`; with an inner join it stays `number`.
 *
 * Source-less expressions (`Src` is `never`, i.e. `b.id.count()`) are never nullified. Untracked ones
 * (`Src` is `string`, i.e. a `sql.ref` on an unknown table) might come from any left-joined table,
 * so they are conservatively nullified whenever the query has a left join at all.
 *
 * `string` must never be a *table's* name: `Extract<"Author", string>` matches, so one left-joined
 * table named `string` would nullify every column in the query. That is why anonymous subqueries
 * share the literal sentinel `"?"` instead.
 */
export type MaybeNull<R, Src extends string, J extends QueryJoins> = string extends Src
  ? [LeftJoined<J[number]>] extends [never]
    ? R
    : R | null
  : [Extract<Src, LeftJoined<J[number]>>] extends [never]
    ? R
    : R | null;

/**
 * The result row for a query with select `S` and joins `J`.
 *
 * - entity mode (`select: a`) is the entity
 * - subquery mode (`select: bookStats`) is the subquery's row, i.e. `select *`
 * - single expression (`select: b.id.count()`) is that expression's value, used by scalar subqueries
 * - POJO mode is a mapped type over the select keys, with left-join nullability applied
 */
export type QueryRow<S, J extends QueryJoins = []> = S extends { readonly [aliasMgmt]: { readonly __entity: infer T } }
  ? T
  : S extends { readonly [subqueryBrand]: { readonly __row: infer R } }
    ? R
    : S extends { readonly [exprBrand]: ExprBrand<infer R, infer Src> }
      ? MaybeNull<R, Src, J>
      : {
          [K in keyof S]: S[K] extends { readonly [exprBrand]: ExprBrand<infer R, infer Src> }
            ? MaybeNull<R, Src, J>
            : never;
        };

// =====================================================================================================
// `query()`: a query POJO becomes a typed table, scalar, or entity list
// =====================================================================================================

/**
 * A table-shaped query: one `Expr` per select key, each tagged with the table's name as its `Src`,
 * plus a brand carrying the row type. This is the direct analog of `Alias<T>`: `Alias<T>` maps entity
 * fields to expressions, `Subquery<Row, Name>` maps the inner query's select keys to expressions.
 */
export type Subquery<R, Name extends string> = {
  readonly [subqueryBrand]: SubqueryBrand<R, Name>;
} & { readonly [K in keyof R]: Expr<R[K], Name> };

/** An entity-mode query (`select: a`): runnable, but it has no columns to reference. */
export type EntityQuery<T extends Entity> = { readonly [entityQueryBrand]: { readonly __row: T } };

/**
 * Rejects a `select` that a `: Query` annotation widened to the whole `QuerySelect` union.
 *
 * `satisfies Query` checks the shape but keeps the literal type of `select`, so `S` infers as
 * `{ name: Expr<string, "Author"> }`. A `: Query` annotation replaces that type with the annotation, so
 * `S` infers as `QuerySelect` itself, and without this guard `query(q)` returned a useless union with no
 * error at all.
 *
 * A widened `S` is the only kind of `S` the whole `QuerySelect` union is assignable to (a POJO, an
 * `Expr`, or an `Alias` never is), so `QuerySelect extends S` detects it, and intersecting the parameter
 * with `{ select: "<message>" }` fails the call on `select` with that message, for `query()` and
 * `em.query()` alike:
 *
 *   const narrow = { from: a, select: { name: a.firstName } } satisfies Query;
 *   query(narrow); // Subquery<{ name: string }, "?">
 *
 *   const widened: Query = { from: a, select: { name: a.firstName } };
 *   query(widened);
 *   // error: Type 'QuerySelect' is not assignable to type
 *   //   '"select was typed too generically; use `satisfies Query` instead of `: Query`"'
 *
 * `S` also defaults to `never`, so a *missing* `select` is reported as "Property 'select' is missing"
 * against `Query<never, []>` instead of tripping this guard.
 */
export type NotWidened<S> = QuerySelect extends S
  ? { select: "select was typed too generically; use `satisfies Query` instead of `: Query`" }
  : unknown;

/** What `query()` returns, by select shape: an entity list, a scalar/list subquery, or a derived table. */
export type QueryValue<S, J extends QueryJoins, Name extends string> = S extends {
  readonly [aliasMgmt]: { readonly __entity: infer T extends Entity };
}
  ? EntityQuery<T>
  : S extends { readonly [exprBrand]: ExprBrand<infer R, any> }
    ? Expr<R | null, never>
    : Subquery<QueryRow<S, J>, Name>;

/** The names of every alias in scope for a query: the source alias plus every joined alias. */
type JoinedName<X> = X extends { readonly inner: infer A }
  ? NameOf<A>
  : X extends { readonly left: infer A }
    ? NameOf<A>
    : never;
type InScope<F, J extends QueryJoins> = NameOf<F> | JoinedName<J[number]>;

/**
 * Asks, for every column of a POJO select: is its source key among `from` + `join` at all? If no, the
 * query reads from a table it never joined, and that select key's type becomes an error message.
 *
 * Because `Expr` already carries `Src`, this is nearly free: for each select key, if `Src` is tracked
 * and any of its names is outside `InScope`, intersect that key's type with an error string, so the
 * caller sees `Type 'Expr<number, "book_stats">' is not assignable to type '... is not in from/join'`.
 * Untracked (`string`) and source-less (`never`) expressions always pass. Aliases with the same
 * type-level name (two bare `alias(Author)`, or two anonymous tables) cannot be told apart, so a miss
 * there goes unreported; the check never gives a false positive, only false negatives on collisions.
 *
 * `[S] extends [...]` keeps this non-distributive, and `never` is skipped outright: `query()` defaults
 * `S` to `never` when `select` is missing, and a distributive conditional over `never` would swallow the
 * whole parameter type.
 */
export type CheckScope<S, F, J extends QueryJoins> = [S] extends [never]
  ? unknown
  : [S] extends [Record<string, ExprLike<any>>]
    ? {
        select: {
          [K in keyof S]: S[K] extends { readonly [exprBrand]: ExprBrand<any, infer Src> }
            ? string extends Src
              ? unknown
              : [Exclude<Src, InScope<F, J>>] extends [never]
                ? unknown
                : `alias '${Exclude<Src, InScope<F, J>> & string}' is not in from/join`
            : unknown;
        };
      }
    : unknown;

/** The one argument type `query()` and `em.query()` share: a `Query` POJO plus its source, name, and checks. */
export type QueryArg<F extends QuerySource, S extends QuerySelect, J extends QueryJoins, Name extends string> = Query<
  S,
  J
> & {
  from: F;
  as?: Name;
} & CheckScope<S, F, J> &
  NotWidened<S>;

/**
 * Turns a `Query` POJO into a value. The select shape decides which (`QueryValue`):
 *
 * - a single expression is a scalar subquery or an IN list (`Expr<R | null>`; a scalar subquery can
 *   return no row, so use `.coalesce(0)` when the SQL guarantees a value, i.e. an ungrouped `count`)
 * - an entity alias is an entity list, runnable via `em.query`
 * - a POJO is a derived table whose columns are `Expr`s; it can be a source, be joined, or be run
 *
 * `as` is the SQL alias and the type-level identity, the same role the second argument of
 * `alias(Author, "m")` plays. Without it the SQL alias is generated, like `alias(Author)`, and all
 * anonymous tables share the type-level identity `"?"`: precise against every named alias, and
 * conservative (a left-joined anonymous table nullifies every anonymous table's columns) only among
 * themselves. This is the same collision two bare `alias(Author)` have.
 *
 * One signature, not three overloads: overloads wrapped every clauses-object mistake in "No overload
 * matches this call", hid `as` from completions, and cost 15-28% check time; the one thing they did
 * better, rejecting a `select` widened by a `: Query` annotation, `NotWidened` does with a clearer message.
 */
export function query<
  F extends QuerySource,
  S extends QuerySelect = never,
  J extends QueryJoins = [],
  Name extends string = "?",
>(q: QueryArg<F, S, J, Name>): QueryValue<S, J, Name> {
  const handle = new SubqueryHandle(q as AnyQuery);
  const select = (q as AnyQuery).select;
  if (isAlias(select)) {
    return { [entityQueryBrand]: handle } as any;
  } else if (isExpr(select)) {
    return new SubqueryExpr(handle) as any;
  } else {
    return newSubqueryProxy(handle) as any;
  }
}

/**
 * The escape hatch for SQL with no modeled shape.
 *
 * Interpolated expressions use the alias Joist assigned, interpolated conditions become SQL,
 * and every other value becomes a `?` binding, so users never write `"a.age * 2"` and hope `a` is the SQL
 * alias, and referenced aliases still count for join pruning.
 *
 *   sql<number>`${bli.amountInCents.sum()} - ${b.quickbooksAmountPaidInCents}`
 *   sql.condition`${sql.ref(p, "ts_search")} @@ plainto_tsquery(${term})`
 *   sql.ref<string>(a, "ts_search")   // an unmodeled column; untracked at the type level
 */
export function sql<R = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Expr<R, never> {
  return new TemplateExpr(strings, values) as any;
}

/** A raw condition for `where`, `having`, or `on`. */
sql.condition = function condition(strings: TemplateStringsArray, ...values: unknown[]): ExpressionCondition {
  return deferredCondition((ctx) => new TemplateExpr(strings, values).toSql(ctx));
};

/** A column Joist does not model, on a source that is in the query. */
sql.ref = function ref<R = unknown>(source: QuerySource, column: string): Expr<R, string> {
  return new RefExpr(handleOf(source), column) as any;
};

// =====================================================================================================
// Runtime: handles, subquery expressions, the proxy
// =====================================================================================================

type AnyQuery = Query<any, any> & { as?: string };

/** The runtime identity of a `query(...)` value; `Ctx.aliasFor` keys on it, like an alias's `AliasMgmt`. */
export class SubqueryHandle {
  constructor(readonly q: AnyQuery) {}

  get name(): string | undefined {
    return this.q.as;
  }

  /** The select keys, for `select: <subquery>` and for reporting unknown columns. */
  columnKeys(): string[] {
    const { select } = this.q;
    if (isPlainSelect(select)) return Object.keys(select);
    if (isSubqueryValue(select)) return select[subqueryBrand].columnKeys();
    return fail(`A subquery with an entity or scalar select has no columns`);
  }

  /** The inner expression behind `key`, for its decoder/encoder. */
  columnExpr(key: string): BaseExpr {
    const { select } = this.q;
    if (isPlainSelect(select)) {
      return (select[key] as any as BaseExpr) ?? fail(`Subquery ${this.describe()} has no column ${key}`);
    } else if (isSubqueryValue(select)) {
      return select[subqueryBrand].columnExpr(key);
    }
    return fail(`Subquery ${this.describe()} has no columns`);
  }

  column(key: string): SubqueryColumnExpr {
    return new SubqueryColumnExpr(this, key, this.columnExpr(key));
  }

  describe(): string {
    return this.q.as ? `'${this.q.as}'` : "(anonymous)";
  }
}

/** A column of a joined/from'd subquery, i.e. `bookStats.bookCount`, which becomes `book_stats."bookCount"`. */
class SubqueryColumnExpr extends BaseExpr {
  constructor(
    private handle: SubqueryHandle,
    private key: string,
    private inner: BaseExpr,
  ) {
    super();
  }

  toSql(ctx: ExprContext): SqlFragment {
    const alias = ctx.aliasFor(this.handle);
    return { sql: `${kq(alias)}.${safeKq(this.key)}`, bindings: [], refs: [alias] };
  }

  decode(value: unknown): unknown {
    return this.inner.decode(value);
  }

  encode(value: unknown): unknown {
    return this.inner.encode(value);
  }
}

/**
 * A scalar (or IN-list) subquery, i.e. `query({ from: b, where: [...], select: b.id.count() })`.
 *
 * It closes over the outer aliases it references, so correlation is free; those references are the
 * subquery's "free" aliases and count toward the outer query's join pruning.
 */
class SubqueryExpr extends BaseExpr {
  readonly isSubquery = true;

  constructor(readonly handle: SubqueryHandle) {
    super();
  }

  toSql(ctx: ExprContext): SqlFragment {
    const bare = this.toSqlBare(ctx);
    return { ...bare, sql: `(${bare.sql})` };
  }

  toSqlBare(ctx: ExprContext): SqlFragment {
    const parent = ctx instanceof Ctx ? ctx : fail("Subqueries need the query parser's context");
    const plan = parseQuery(this.handle.q, parent, parent.assigner);
    return { sql: plan.sql, bindings: plan.bindings, refs: plan.outerRefs };
  }

  decode(value: unknown): unknown {
    return (this.handle.q.select as any as BaseExpr).decode(value);
  }

  encode(value: unknown): unknown {
    return (this.handle.q.select as any as BaseExpr).encode(value);
  }
}

function newSubqueryProxy(handle: SubqueryHandle): object {
  return new Proxy(
    {},
    {
      get(_, key) {
        if (key === subqueryBrand) return handle;
        if (typeof key === "string") return handle.column(key);
        return undefined;
      },
      has(_, key) {
        return key === subqueryBrand || (typeof key === "string" && handle.columnKeys().includes(key));
      },
    },
  );
}

function isSubqueryValue(value: unknown): value is { [subqueryBrand]: SubqueryHandle } {
  return typeof value === "object" && value !== null && subqueryBrand in value;
}

function isEntityQueryValue(value: unknown): value is { [entityQueryBrand]: SubqueryHandle } {
  return typeof value === "object" && value !== null && entityQueryBrand in value;
}

function isPlainSelect(select: unknown): select is Record<string, ExprLike<any>> {
  return (
    typeof select === "object" && select !== null && !isAlias(select) && !isExpr(select) && !isSubqueryValue(select)
  );
}

/** Returns the runtime identity of a source: an alias's `AliasMgmt` or a subquery's handle. */
function handleOf(source: unknown): AliasMgmt | SubqueryHandle {
  if (isAlias(source)) return getAliasMgmt(source);
  if (isSubqueryValue(source)) return source[subqueryBrand];
  return fail(`Expected an alias or a query(...) value, got ${source}`);
}

// =====================================================================================================
// Runtime: parse -> prune -> SQL -> decode
// =====================================================================================================

/** Runs `em.query(...)`: a `Query` POJO, or a `query(...)` value. */
/**
 * Parses `arg` (a `Query` POJO or `query(...)` value) into a runnable `Plan`.
 *
 * `EntityManager.query` runs the plan; this module deliberately does not import `EntityManager` (see
 * `EntityHydrator`), so it parses and hands back `{ sql, bindings, decodeRows }` instead of executing.
 */
export function parseUserQuery(arg: unknown): Plan {
  return parseQuery(toQuery(arg), undefined, new AliasAssigner());
}

function toQuery(arg: unknown): AnyQuery {
  if (isSubqueryValue(arg)) return arg[subqueryBrand].q;
  if (isEntityQueryValue(arg)) return arg[entityQueryBrand].q;
  if (arg instanceof SubqueryExpr) return arg.handle.q;
  if (typeof arg === "object" && arg !== null && "from" in arg && "select" in arg) return arg as AnyQuery;
  return fail(`em.query expects a { from, select, ... } object or a query(...) value`);
}

/**
 * What an expression needs from the query it is generating SQL for.
 *
 * Each (sub)query gets its own `Ctx`; a lookup that misses locally walks up to the enclosing query and
 * records the hit in `outerRefs`, which is how a correlated subquery reports the outer aliases it
 * depends on (the way `ExistsCondition.outerAliases` does), so join pruning keeps them.
 */
class Ctx implements ExprContext {
  private aliases = new Map<object, string>();
  readonly outerRefs = new Set<string>();

  constructor(
    readonly assigner: AliasAssigner,
    private parent: Ctx | undefined,
  ) {}

  register(handle: object, alias: string): void {
    this.aliases.set(handle, alias);
  }

  aliasFor(handle: object): string {
    const local = this.aliases.get(handle);
    if (local) return local;
    if (this.parent) {
      const outer = this.parent.aliasFor(handle);
      this.outerRefs.add(outer);
      return outer;
    }
    return fail(`${describeHandle(handle)} is not in this query's from/join`);
  }

  conditionToSql(cond: ExpressionCondition): SqlFragment | undefined {
    // Inside another expression (i.e. a `sql` template), keep `a OR b` grouped
    return conditionToSql(cond, this, false);
  }
}

function describeHandle(handle: object): string {
  if (handle instanceof SubqueryHandle) return `Subquery ${handle.describe()}`;
  if (handle instanceof JoinTableHandle) return `Join table ${handle.joinTableName}`;
  if ("tableName" in handle) return `Alias for ${(handle as AliasMgmt).tableName}`;
  return "Alias";
}

interface ParsedSource {
  handle: AliasMgmt | SubqueryHandle | JoinTableHandle;
  alias: string;
  /** `table AS alias` or `(SELECT ...) AS alias`. */
  sql: string;
  bindings: any[];
  /** Outer aliases a derived table references; PG rejects those without LATERAL, but pruning should still see them. */
  refs: string[];
  /** CTI base/sub-table joins that travel with an entity alias. */
  extraJoins: string[];
  /** Entity-mode selects, i.e. `a.*` plus CTI columns and the `__class` tag. */
  entitySelects: string[];
  meta: EntityMetadata | undefined;
}

interface ParsedJoin {
  kind: "inner" | "left";
  source: ParsedSource;
  /** The user's ON alone; `undefined` means it pruned away entirely, an error if the join is kept. */
  userOn: SqlFragment | undefined;
  /** The ON to emit: the user's ON plus any injected soft-delete/STI-discriminator conditions. */
  fullOn: SqlFragment | undefined;
  keep: boolean;
}

/**
 * The one `EntityManager` capability that row decoding needs, typed structurally.
 *
 * Importing `EntityManager.ts` here would complete an `EntityManager.ts` <-> `query.ts` declaration
 * cycle (`EntityManager.query` imports this module's types), which correlated with a tsc 7.0.2
 * incremental-build bug: after tsdown rewrites `build/`, `tsc --build` sporadically reports thousands
 * of phantom "Module 'joist-orm' has no exported member ..." errors and caches them in `.tsbuildinfo`.
 */
export interface EntityHydrator {
  hydrate(cstr: any, rows: readonly any[]): any[];
}

export interface Plan {
  sql: string;
  bindings: any[];
  /** Aliases of enclosing queries this (sub)query referenced. */
  outerRefs: string[];
  decodeRows(em: EntityHydrator, rows: any[]): any[];
}

/**
 * Parses one `Query` POJO into SQL, recursively for subqueries.
 *
 * 1. Assign a SQL alias to every source and bind entity aliases (`setAlias`, so `ColumnCondition`s
 *    created by `a.age.gte(18)` learn their alias, exactly as in `em.find`).
 * 2. Generate SQL for sources, selects, conditions, group-bys, and order-bys against the context; every fragment
 *    reports the aliases it references.
 * 3. Prune: drop joins nothing references (see below), then reject a kept join whose ON collapsed.
 * 4. Assemble the SQL from the kept fragments, so pruned bindings disappear with their SQL.
 */
function parseQuery(q: AnyQuery, parent: Ctx | undefined, assigner: AliasAssigner): Plan {
  const ctx = new Ctx(assigner, parent);
  const selectedAlias = isAlias(q.select) ? getAliasMgmt(q.select) : undefined;
  const joinEntries = [...(q.join ?? [])].filter(isDefined);

  // 1. Assign and bind every alias before generating any SQL, so ON conditions can reference any source.
  const fromThunk = registerSource(q.from, ctx, assigner, handleOf(q.from) === selectedAlias);
  const joinThunks = joinEntries.flatMap((j) => {
    const kind = "inner" in j && j.inner ? ("inner" as const) : ("left" as const);
    const alias = kind === "inner" ? j.inner : j.left;
    const keep = j.keep ?? false;
    // Only collection sugar joins (o2m/m2m) filter soft-deletes, em.find's relation semantics:
    // references (m2o/o2o/poly) resolve soft-deleted entities, and explicit joins are the user's own
    const softDeletes = (j as any)[collectionJoin] === true;
    const target = { kind, keep, on: j.on, softDeletes, source: registerSource(alias, ctx, assigner, false) };
    // A sugar m2m join (`a.tags.as(t)`) carries a hidden join-table join; emit it first, with the same kind
    const m2m: M2mJoinTable | undefined = (j as any)[m2mJoinTable];
    if (!m2m) return [target];
    return [
      { kind, keep, on: m2m.on, softDeletes: false, source: registerJoinTable(m2m.handle, ctx, assigner) },
      target,
    ];
  });

  // 2. Generate SQL.
  const softDeletes = q.softDeletes ?? "exclude";
  const from = fromThunk();
  const joins: ParsedJoin[] = joinThunks.map((j) => {
    const source = j.source();
    // `userOn` is the user's ON alone, so the collapsed-ON check below is not fooled by injections
    const userOn = conditionToSql(j.on, ctx, true);
    const injected = injectedConditions(source, j.softDeletes ? softDeletes : "include");
    const fullOn = userOn && injected.length > 0 ? conditionToSql({ and: [j.on, ...injected] }, ctx, true) : userOn;
    return { kind: j.kind, keep: j.keep, source, userOn, fullOn };
  });
  const { selects, decodeRows } = selectsToSql(q, ctx, from);
  const fromInjected = injectedConditions(from, softDeletes);
  const where = conditionToSql(fromInjected.length > 0 ? { and: [q.where, ...fromInjected] } : q.where, ctx, true);
  const having = conditionToSql(q.having, ctx, true);
  const groupBys = (q.groupBy ?? []).map((g) => asExpr(g, "groupBy").toSql(ctx));
  const orderBys = orderBysToSql(q, ctx);

  // 3. Prune.
  const kept = pruneJoins(q, from, joins, [...selects, ...groupBys, ...orderBys, where, having].filter(isDefined));
  for (const j of kept) {
    if (!j.userOn) {
      fail(
        `Join ${describeHandle(j.source.handle)} has no ON condition left (they all pruned), but the query still references it`,
      );
    }
  }

  // 4. Assemble.
  const out: SqlFragment[] = [];
  out.push({ sql: `SELECT ${q.distinct ? "DISTINCT " : ""}`, bindings: [], refs: [] });
  out.push(joinFragmentParts(selects, ", "));
  out.push({ sql: ` FROM ${from.sql}`, bindings: from.bindings, refs: [] });
  for (const extra of from.extraJoins) out.push({ sql: ` ${extra}`, bindings: [], refs: [] });
  for (const j of kept) {
    const keyword = j.kind === "inner" ? "JOIN" : "LEFT OUTER JOIN";
    out.push({
      sql: ` ${keyword} ${j.source.sql} ON ${j.fullOn!.sql}`,
      bindings: [...j.source.bindings, ...j.fullOn!.bindings],
      refs: [],
    });
    for (const extra of j.source.extraJoins) out.push({ sql: ` ${extra}`, bindings: [], refs: [] });
  }
  if (where) out.push({ sql: ` WHERE ${where.sql}`, bindings: where.bindings, refs: [] });
  if (groupBys.length > 0)
    out.push({ ...joinFragmentParts(groupBys, ", "), sql: ` GROUP BY ${groupBys.map((g) => g.sql).join(", ")}` });
  if (having) out.push({ sql: ` HAVING ${having.sql}`, bindings: having.bindings, refs: [] });
  if (orderBys.length > 0)
    out.push({ ...joinFragmentParts(orderBys, ", "), sql: ` ORDER BY ${orderBys.map((o) => o.sql).join(", ")}` });
  if (q.limit !== undefined) out.push({ sql: ` LIMIT ?`, bindings: [q.limit], refs: [] });
  if (q.offset !== undefined) out.push({ sql: ` OFFSET ?`, bindings: [q.offset], refs: [] });

  const sqlText = out.map((o) => o.sql).join("");
  // `unsetN.` is a deferred-binding placeholder that only survives when a condition references an alias
  // that is not in this query's from/join, i.e. its `setAlias` callbacks never fired
  const unset = sqlText.match(/\bunset\d*\./);
  if (unset) {
    fail(`A condition references an alias that is not in this query's from/join (rendered as '${unset[0]}')`);
  }

  return {
    sql: sqlText,
    bindings: out.flatMap((o) => o.bindings),
    outerRefs: [...ctx.outerRefs],
    decodeRows,
  };
}

/**
 * Assigns a SQL alias to a source and returns a thunk that produces its SQL once every alias is known.
 *
 * Entity aliases are bound with `setAlias`, which fires the deferred-binding callbacks that
 * `ColumnCondition`s registered when they were created; CTI entities get their base/sub-table joins from
 * `addTablePerClassJoinsAndClassTag`, and the entity-mode `select` gets that helper's selects too.
 */
function registerSource(source: unknown, ctx: Ctx, assigner: AliasAssigner, isPrimary: boolean): () => ParsedSource {
  const handle = handleOf(source);
  if (handle instanceof SubqueryHandle) {
    const alias = handle.name ? assigner.getLiteralAlias(handle.name) : assigner.getLiteralAlias("sq");
    ctx.register(handle, alias);
    return () => {
      const inner = parseQuery(handle.q, ctx, assigner);
      return {
        handle,
        alias,
        sql: `(${inner.sql}) AS ${safeKq(alias)}`,
        bindings: inner.bindings,
        refs: inner.outerRefs,
        extraJoins: [],
        entitySelects: [],
        meta: undefined,
      };
    };
  } else {
    const meta = getAliasMetadata(source as any);
    const alias = assigner.getAlias(meta.tableName);
    handle.setAlias(meta, alias);
    ctx.register(handle, alias);
    return () => {
      const cti: ParsedFindQuery = { selects: [], tables: [], orderBys: [] };
      addTablePerClassJoinsAndClassTag(cti, meta, alias, isPrimary);
      const extraJoins = cti.tables.map((t) => {
        if (t.join !== "outer") return fail(`Unexpected ${t.join} join for CTI`);
        return `LEFT OUTER JOIN ${kq(t.table)} AS ${kq(t.alias)} ON ${t.col1} = ${t.col2}`;
      });
      const entitySelects = cti.selects.length > 0 ? (cti.selects as string[]) : [kqStar(alias)];
      return {
        handle,
        alias,
        sql: `${kq(meta.tableName)} AS ${kq(alias)}`,
        bindings: [],
        refs: [],
        extraJoins,
        entitySelects,
        meta,
      };
    };
  }
}

/**
 * em.find's per-source injections: `alias.deleted_at IS NULL` for a soft-deletable entity (CTI
 * subtypes are skipped, like em.find; see `filterSoftDeletes`), and the `type_id = X` discriminator
 * for an STI subtype, so `from: alias(TaskNew)` only sees (and a joined subtype only matches)
 * TaskNew rows.
 *
 * The conditions go into the from's WHERE or the join's ON, and never keep an otherwise unreferenced
 * join alive, which is what `pruneable: true` means on em.find's side.
 */
function injectedConditions(source: ParsedSource, softDeletes: "include" | "exclude"): ColumnCondition[] {
  const { meta } = source;
  if (!meta) return [];
  const conditions: ColumnCondition[] = [];
  if (filterSoftDeletes(meta, softDeletes)) {
    const field = meta.allFields[getBaseMeta(meta).timestampFields!.deletedAt!];
    const column = field.serde!.columns[0];
    conditions.push({
      kind: "column",
      alias: `${source.alias}${field.aliasSuffix}`,
      column: column.columnName,
      dbType: column.dbType,
      cond: { kind: "is-null" },
      pruneable: true,
    });
  }
  const sti = stiSubtypeFilter(meta, source.alias);
  if (sti) conditions.push(sti);
  return conditions;
}

/** Registers a sugar m2m join table, i.e. `authors_to_tags`: a raw table with no entity metadata. */
function registerJoinTable(handle: JoinTableHandle, ctx: Ctx, assigner: AliasAssigner): () => ParsedSource {
  const alias = assigner.getAlias(handle.joinTableName);
  ctx.register(handle, alias);
  return () => ({
    handle,
    alias,
    sql: `${kq(handle.joinTableName)} AS ${kq(alias)}`,
    bindings: [],
    refs: [],
    extraJoins: [],
    entitySelects: [],
    meta: undefined,
  });
}

/** Generates the `select` clause SQL and returns how to decode the resulting rows. */
function selectsToSql(
  q: AnyQuery,
  ctx: Ctx,
  from: ParsedSource,
): { selects: SqlFragment[]; decodeRows: Plan["decodeRows"] } {
  const { select } = q;
  if (isAlias(select)) {
    // Entity mode: `a.*` (plus CTI columns), hydrated through the identity map
    const alias = ctx.aliasFor(getAliasMgmt(select));
    const meta = getAliasMetadata(select);
    const source = from.handle === getAliasMgmt(select) ? from : undefined;
    const selects = (source?.entitySelects ?? [kqStar(alias)]).map((s) => ({ sql: s, bindings: [], refs: [alias] }));
    return { selects, decodeRows: (em, rows) => em.hydrate(meta.cstr as any, rows) };
  } else if (isSubqueryValue(select)) {
    // `select: <subquery>` is `select *` for that table
    const handle = select[subqueryBrand];
    const alias = ctx.aliasFor(handle);
    const keys = handle.columnKeys();
    const selects = keys.map((k) => ({
      sql: `${kq(alias)}.${safeKq(k)} AS ${safeKq(k)}`,
      bindings: [],
      refs: [alias],
    }));
    const decoders = keys.map((k) => [k, handle.columnExpr(k)] as const);
    return { selects, decodeRows: (_, rows) => rows.map((row) => decodeRow(row, decoders)) };
  } else if (isExpr(select)) {
    // Scalar mode: one value per row, used by scalar/IN-list subqueries
    const fragment = asNode(select).toSql(ctx);
    const selects = [{ ...fragment, sql: `${fragment.sql} AS value` }];
    return { selects, decodeRows: (_, rows) => rows.map((row) => asNode(select).decode(row.value)) };
  } else if (isPlainSelect(select)) {
    // POJO mode
    const entries = Object.entries(select).map(([key, expr]) => [key, asExpr(expr, `select.${key}`)] as const);
    const selects = entries.map(([key, expr]) => {
      const fragment = expr.toSql(ctx);
      return { ...fragment, sql: `${fragment.sql} AS ${safeKq(key)}` };
    });
    return { selects, decodeRows: (_, rows) => rows.map((row) => decodeRow(row, entries)) };
  }
  return fail(`Unsupported select ${select}`);
}

function decodeRow(row: any, decoders: readonly (readonly [string, BaseExpr])[]): any {
  const result: any = {};
  for (const [key, expr] of decoders) {
    const value = row[key];
    result[key] = value === null || value === undefined ? null : expr.decode(value);
  }
  return result;
}

const ORDER_BY_DIRECTIONS: string[] = [
  "ASC",
  "DESC",
  "ASC NULLS FIRST",
  "ASC NULLS LAST",
  "DESC NULLS FIRST",
  "DESC NULLS LAST",
];

/** SQL for the `orderBy` clause: the array form's expression entries, or the keyed form's `OrderByKeys`. */
function orderBysToSql(q: AnyQuery, ctx: Ctx): SqlFragment[] {
  const { orderBy, select } = q;
  if (!orderBy) return [];
  if (Array.isArray(orderBy)) return orderBy.filter(isDefined).map((o) => orderByToSql(o, ctx));
  return Object.entries(orderBy).flatMap(([key, dir]) => {
    if (dir === undefined) return [];
    // The direction is interpolated into the SQL, so never trust it, i.e. it might be a request param
    if (!ORDER_BY_DIRECTIONS.includes(dir as string)) return fail(`Invalid orderBy direction '${dir}'`);
    // Entity mode orders by the alias's column; POJO/subquery selects order by the output column name
    if (isAlias(select)) {
      const column = (select as any)[key];
      if (!isExpr(column)) return fail(`orderBy key '${key}' is not a sortable field of the entity`);
      const fragment = asNode(column).toSql(ctx);
      return [{ ...fragment, sql: `${fragment.sql} ${dir}` }];
    }
    if (isExpr(select)) return fail(`the keyed orderBy form needs a POJO or entity select`);
    const keys = isSubqueryValue(select) ? select[subqueryBrand].columnKeys() : Object.keys(select as object);
    if (!keys.includes(key)) return fail(`orderBy key '${key}' is not a key of select`);
    return [{ sql: `${safeKq(key)} ${dir}`, bindings: [], refs: [] }];
  });
}

function orderByToSql(o: QueryOrderBy, ctx: Ctx): SqlFragment {
  const [expr, direction] = "asc" in o && o.asc ? [o.asc, "ASC"] : [o.desc, "DESC"];
  const fragment = asExpr(expr, "orderBy").toSql(ctx);
  // `nulls` is interpolated into the SQL, so never trust it, i.e. it might cross an `any` boundary
  if (o.nulls !== undefined && o.nulls !== "first" && o.nulls !== "last") {
    return fail(`Invalid orderBy nulls '${o.nulls}'`);
  }
  const nulls = o.nulls ? ` NULLS ${o.nulls.toUpperCase()}` : "";
  return { ...fragment, sql: `${fragment.sql} ${direction}${nulls}` };
}

/**
 * Parses a user-facing condition (a single condition or an `{ and }`/`{ or }` filter) with the same
 * `ConditionBuilder` `em.find` uses, so `undefined` members drop out, empty groups drop, and
 * `pruneIfUndefined` applies unchanged. Deferred (expression-vs-expression) conditions are resolved
 * against the context first.
 */
function conditionToSql(cond: ExpressionCondition | undefined, ctx: Ctx, topLevel: boolean): SqlFragment | undefined {
  if (cond === undefined || cond === null) return undefined;
  resolveDeferredConditions(cond, ctx);
  const filter: ExpressionFilter = isFilter(cond) ? cond : { and: [cond] };
  const cb = new ConditionBuilder();
  cb.maybeAddExpression(filter);
  const parsed = cb.toExpressionFilter();
  if (!parsed) return undefined;
  const where = buildWhereClause(parsed, topLevel);
  if (!where) return undefined;
  return { sql: where[0], bindings: where[1], refs: refsOf(parsed) };
}

function isFilter(cond: ExpressionCondition): cond is ExpressionFilter {
  return ("and" in cond && cond.and !== undefined) || ("or" in cond && cond.or !== undefined);
}

/** The aliases a parsed condition tree references, normalized to their base (non-CTI-suffixed) alias. */
function refsOf(parsed: ParsedExpressionFilter): string[] {
  return deepFindConditions(parsed, false)
    .flatMap((c) => (c.kind === "column" ? [c.alias] : c.kind === "raw" ? c.aliases : c.outerAliases))
    .map(baseAlias);
}

/** `a_b0` (a CTI base table) and `a_s1` (a CTI sub table) both belong to alias `a`. */
function baseAlias(alias: string): string {
  return alias.replace(/_[bs]\d+$/, "");
}

/**
 * Pruning: em.find's paradigm, on a flat join list.
 *
 * A condition given `undefined` was already dropped by `ConditionBuilder`. Now a join that nothing
 * references anymore drops with it: a join is required if the source, a select, a surviving condition,
 * a group-by, an order-by, or another required join's ON references it, or if it is pinned with
 * `keep: true`. Marking follows ON dependencies transitively, exactly like `pruneUnusedJoins`'s
 * `DependencyTracker`.
 *
 * em.find's joins almost never filter rows by themselves, so pruning them is semantics-preserving. An
 * explicit `{ inner: b, on }` here does filter rows, so pruning it when unreferenced drops that filter;
 * that matches `{ books: { title: undefined } }` in em.find and is deliberate. `keep: true` pins it, and
 * a pure existence filter is better written as `a.id.in(query({ ... }))`, which is never `undefined`.
 */
function pruneJoins(q: AnyQuery, from: ParsedSource, joins: ParsedJoin[], used: SqlFragment[]): ParsedJoin[] {
  if (q.pruneJoins === false) return joins;
  const deps = new Map<string, string[]>();
  for (const j of joins) {
    const refs = [...(j.userOn?.refs ?? []), ...j.source.refs].map(baseAlias).filter((r) => r !== j.source.alias);
    deps.set(j.source.alias, refs);
  }
  const required = new Set<string>();
  function markRequired(alias: string): void {
    if (required.has(alias)) return;
    required.add(alias);
    for (const dep of deps.get(alias) ?? []) markRequired(dep);
  }
  markRequired(from.alias);
  for (const r of used.flatMap((u) => u.refs)) markRequired(baseAlias(r));
  for (const j of joins) if (j.keep) markRequired(j.source.alias);
  return joins.filter((j) => required.has(j.source.alias));
}

function asExpr(value: unknown, where: string): BaseExpr {
  if (isExpr(value)) return value as any as BaseExpr;
  return fail(
    `${where} must be an expression, i.e. an alias column, aggregate, sql\`...\`, or query(...); got ${value}`,
  );
}

function joinFragmentParts(parts: SqlFragment[], sep: string): SqlFragment {
  return { sql: parts.map((p) => p.sql).join(sep), bindings: parts.flatMap((p) => p.bindings), refs: [] };
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

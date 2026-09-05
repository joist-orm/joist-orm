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
  type ExprOutputType,
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
  lazyExcludedSelects,
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
 * An expression order-by entry: the direction is the key and the expression is the value, unlike
 * the keyed form's field name and `"ASC" | "DESC"` value. `never` on the other key keeps an
 * entry to one direction, the same trick `ExpressionFilter` uses for `and`/`or`. `nulls` is
 * `NULLS FIRST/LAST`.
 *
 * When select keys are known, exclude them so a keyed sort cannot be silently ignored inside an
 * expression entry. An untyped `Query` has no known keys to exclude.
 */
export type QueryOrderBy<S = never> = (
  | { readonly asc: ExprLike<any>; readonly desc?: never }
  | { readonly desc: ExprLike<any>; readonly asc?: never }
) & { readonly nulls?: "first" | "last" } & (string extends OrderByKey<S>
    ? unknown
    : { readonly [K in Exclude<OrderByKey<S>, "asc" | "desc" | "nulls">]?: never });

export type OrderByDirection =
  | "ASC"
  | "DESC"
  | "ASC NULLS FIRST"
  | "ASC NULLS LAST"
  | "DESC NULLS FIRST"
  | "DESC NULLS LAST";

/**
 * A keyed `orderBy` entry, used alone or in an array, like `em.find`'s `orderBy: [{ firstName: "ASC" }]`.
 *
 * The keys are the keys of a POJO/subquery `select` (rendered as SQL output-column names, so ordering
 * by an aggregate does not repeat its expression), or the entity's sortable fields in entity mode.
 * An `undefined` direction prunes the entry, like any other condition. For expressions that are not
 * in `select`, mix in `{ asc: expr }` / `{ desc: expr }` entries in the array form.
 */
export type OrderByKeys<S> = S extends { readonly [aliasMgmt]: { readonly __entity: infer T } }
  ? T extends Entity
    ? { readonly [K in keyof Alias<T> as Alias<T>[K] extends ExprLike<any> ? K : never]?: OrderByDirection | undefined }
    : never
  : S extends { readonly [exprBrand]: any }
    ? never
    : { readonly [K in keyof S & string]?: OrderByDirection | undefined };

/** All sortable keys across select variants, not just the keys shared by every variant. */
type OrderByKey<S> = S extends unknown ? keyof OrderByKeys<S> : never;

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
  orderBy?: readonly (QueryOrderBy<S> | OrderByKeys<S> | undefined)[] | OrderByKeys<S>;
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
export interface Query<S extends QuerySelect = QuerySelect, J extends QueryJoins = QueryJoins>
  extends Clauses<S, J>, Partial<Record<SetOperation, never>> {
  from: QuerySource;
}

/**
 * The six PostgreSQL set operations. Each compound root has exactly one operation.
 *
 * I.e. `union` removes duplicate projected Author names; `unionAll` keeps every copy.
 */
export type SetOperation = "union" | "unionAll" | "intersect" | "intersectAll" | "except" | "exceptAll";

/**
 * For set operations like UNION, this is one read operand with named POJO columns: an ordinary query,
 * a reusable query value, or another compound.
 * Scalar queries, expressions, and entity hydration are excluded.
 *
 * I.e. `{ from: a, select: { id: a.id } }` and its `query(...)` value can contribute Author IDs to a
 * union. `{ from: a, select: a.id }` cannot: even one-column set operands must give that column a name.
 */
export type SetOperand =
  | Query<Record<string, ExprLike<unknown>> | Subquery<unknown, string>>
  | Subquery<unknown, string>
  | SetQuery<readonly SetOperand[]>;

/**
 * SQL-shaped compound input; use `satisfies SetQuery` to retain the operands' literal row types.
 *
 * I.e. for Author alias `a` and Book alias `b`:
 * ```ts
 * const names = {
 *   union: [
 *     { from: a, select: { name: a.firstName } },
 *     { from: b, select: { name: b.title } },
 *   ],
 *   orderBy: { name: "ASC" },
 * } satisfies SetQuery;
 * ```
 *
 * The default operand tuple requires at least two reads. `query` and `em.query` also infer dynamically
 * sized arrays; `CheckSetQuery` validates their row types, and runtime validation checks their length.
 * This input shape checks direction values; `CheckSetQuery` checks the inferred output keys in orderBy.
 */
export type SetQuery<Operands extends readonly SetOperand[] = readonly [SetOperand, SetOperand, ...SetOperand[]]> = {
  // Each K creates one alternative, i.e. required `union` with the other five operation keys forbidden.
  [K in SetOperation]: { readonly [P in K]: Operands } & { readonly [P in Exclude<SetOperation, K>]?: never };
}[SetOperation] & {
  // These clauses belong to the combined rows, not to an implicit first SELECT.
  readonly orderBy?:
    | Readonly<Record<string, OrderByDirection | undefined>>
    | readonly (Readonly<Record<string, OrderByDirection | undefined>> | undefined)[];
  readonly limit?: number;
  readonly offset?: number;
  readonly as?: string;
} & {
  // SELECT clauses and branch policies must stay inside operands or an ordinary outer query.
  readonly [
    K in "from" | "select" | "join" | "where" | "groupBy" | "having" | "distinct" | "softDeletes" | "pruneJoins"
  ]?: never;
};

/**
 * Extracts the operand collection from each possible compound root, ignoring pagination and ordering.
 *
 * I.e. for `Q = { union: readonly [typeof authorNames, typeof bookNames]; limit: 10 }`, the result is
 * `readonly [typeof authorNames, typeof bookNames]`. Distributing over Q also handles a runtime choice
 * between different operations; Extract discards optional, unused operation keys whose value is undefined.
 */
type OperandsOf<Q> = Q extends unknown ? Extract<Q[keyof Q & SetOperation], readonly SetOperand[]> : never;

/**
 * Gets the left operand, which supplies canonical output keys and the retained row type for EXCEPT/INTERSECT.
 *
 * I.e. `FirstOperand<{ except: readonly [typeof authorNames, typeof bookNames] }>` is `typeof authorNames`.
 * For a dynamic array, the exact first element is unknown, so this is the array's element type instead.
 */
type FirstOperand<Q> = OperandsOf<Q>[0];

/**
 * Resolves the named rows of an ordinary or compound read operand, including its LEFT join nullability.
 *
 * I.e. a query from Author `a` with a LEFT-joined Book `b` and `select: { title: b.title }` has row type
 * `{ title: string | null }`, even though Book.title is required. A reusable `query(...)` value already
 * stores that row type in its brand; a nested compound combines its own operands recursively.
 */
export type ReadQueryRow<Q> = SetOperand extends Q
  ? // Stop at the general, recursive operand type: its projection is unknown, not an empty POJO.
    unknown
  : // Read the brand before inspecting `select`, which could itself be a named column on a query value.
    Q extends { readonly [subqueryBrand]: { readonly __row: infer R } }
    ? R
    : Q extends { select: infer S }
      ? // A declared Query<S, J> has an optional join property that still carries J's LEFT joins.
        QueryRow<S, "join" extends keyof Q ? Extract<Q[keyof Q & "join"], QueryJoins> : []>
      : [OperandsOf<Q>] extends [never]
        ? never
        : SetQueryRow<Q>;

/**
 * UNION combines each column's values; INTERSECT and EXCEPT conservatively retain the left row.
 *
 * I.e. Author first names projected as `{ name: string }` unioned with LEFT-joined Book titles projected
 * as `{ name: string | null }` produce `{ name: string | null }`. EXCEPT with those Author names on the
 * left retains `{ name: string }`; it neither adds the right side's NULL nor promises narrower values.
 *
 * The outer conditional distributes over a TypeScript union of alternative queries. I.e. a runtime
 * choice between an Author-name UNION and a Book-order EXCEPT must retain `{ name: string } | { order: number }`.
 */
export type SetQueryRow<Q> = Q extends unknown
  ? {
      // The first operand supplies keys; const/readonly input projections do not make result rows readonly.
      -readonly [K in keyof ReadQueryRow<FirstOperand<Q>>]: ColumnValue<
        // UNION can return values from any operand; EXCEPT/INTERSECT return values from the left.
        Q extends { union: readonly SetOperand[] } | { unionAll: readonly SetOperand[] }
          ? ReadQueryRow<OperandsOf<Q>[number]>
          : ReadQueryRow<FirstOperand<Q>>,
        K
      >;
    }
  : never;

/**
 * Collects column K's value from each row alternative in R, rather than requiring K on every alternative.
 *
 * I.e. `ColumnValue<{ name: string } | { name: string | null }, "name">` is `string | null`.
 * An alternative without K contributes never; `CompatibleRow` separately rejects mismatched operand keys.
 */
type ColumnValue<R, K extends PropertyKey> = R extends unknown ? (K extends keyof R ? R[K] : never) : never;

/**
 * Checks whether either non-null value type is assignable to the other, without requiring equal nullability.
 *
 * I.e. `CompatibleValue<number, number | null>` is true, while `CompatibleValue<AuthorId, BookId>` is false.
 * This is only a TypeScript check: Author.age and Author.age.sum() both pass as numbers, but runtime
 * output-type checks must still reject their different int4/int8 representations.
 */
type CompatibleValue<L, R> = [NonNullable<L>] extends [NonNullable<R>]
  ? true
  : [NonNullable<R>] extends [NonNullable<L>]
    ? true
    : false;

/**
 * Requires exactly the same output keys and compatible TypeScript values for every column.
 *
 * I.e. `L = { name: string; age: number }` and `R = { age: number | null; name: string }` are compatible despite
 * key order and nullability. `{ name: string }` and `{ title: string }` are not. SQL representations and
 * codec domains still need runtime validation; this boolean does not establish decoder compatibility.
 */
type CompatibleRow<L, R> = [keyof L] extends [keyof R]
  ? // Checking both directions rejects missing and extra right-side keys, not just a shared subset.
    [keyof R] extends [keyof L]
    ? // Reduce the per-column flags to a union: any false rejects the complete row.
      false extends { [K in keyof L]: CompatibleValue<L[K], ColumnValue<R, K>> }[keyof L]
      ? false
      : true
    : false
  : false;

/**
 * Produces a constraint for Q: unknown leaves a valid operand unchanged, while a message rejects it.
 *
 * I.e. First can select Author.firstName as `name` and Q can select Book.title as `name`. Both pass.
 * Changing Q's key to `title` produces the key/value diagnostic. A nested compound must also pass its own
 * arity and ordering checks, not merely expose a compatible result row.
 */
type CheckOperand<First, Q> =
  CompatibleRow<ReadQueryRow<First>, ReadQueryRow<Q>> extends true
    ? // Validate nested roots too, so an otherwise compatible one-operand UNION cannot hide inside Q.
      Q extends SetQuery<readonly SetOperand[]>
      ? CheckSetQuery<Q>
      : unknown
    : "set operands must have the same keys and compatible column values";

/**
 * Checks every operand against O[0] while preserving the collection's tuple shape and readonly modifier.
 *
 * I.e. compatible operands `O = readonly [typeof authorNames, typeof bookNames]` produce
 * `readonly [unknown, unknown]` constraints. Mapping O directly preserves length instead of validating
 * array methods and the length property as though they were additional query operands.
 */
type CheckOperands<O extends readonly SetOperand[]> = { readonly [I in keyof O]: CheckOperand<O[0], O[I]> };

/**
 * Restricts each ordering hash to Keys, including hashes supplied through variables or readonly arrays.
 *
 * I.e. with `Keys = "name"`, `{ name: "ASC" }` and `[undefined, { name: "DESC" }]` pass, but a `title`
 * key receives a diagnostic. SetQuery already restricts direction values; this check does not replace them.
 */
type CheckSetOrder<O, Keys> = O extends readonly unknown[]
  ? // Preserve each array entry so an invalid hash is reported at its own position.
    { readonly [I in keyof O]: CheckSetOrder<O[I], Keys> }
  : { readonly [K in keyof O]: K extends Keys ? unknown : "orderBy must name a set output column" };

/**
 * Validate known tuples and output ordering without widening the inferred operand projections.
 * Preserve optional keys when TypeScript infers a runtime choice between different operations.
 *
 * I.e. `{ union: [authorNames] as const }` fails minimum arity; a `typeof authorNames[]` can pass the
 * static checks but still needs a runtime length check. If authorNames and bookNames both expose only
 * `name`, combining them with `orderBy: { title: "ASC" }` fails the output-key check.
 *
 * The result is intersected with the inferred input Q. Unknown constraints leave its literal types
 * intact; error messages make the offending operands or ordering keys incompatible with that input.
 */
export type CheckSetQuery<Q extends SetQuery<readonly SetOperand[]>> = Q extends unknown
  ? // A widened first operand has lost the output keys and values needed to validate the remaining reads.
    SetOperand extends FirstOperand<Q>
    ? "set operands were typed too generically; use `satisfies SetQuery` instead"
    : {
        // Map Q itself so unused optional operation keys stay optional for UNION-or-EXCEPT input types.
        readonly [K in keyof Q]: K extends SetOperation
          ? Q[K] extends readonly SetOperand[]
            ? // Dynamic arrays retain their row types but defer minimum arity to runtime.
              number extends Q[K]["length"]
              ? CheckOperands<Q[K]>
              : // A known tuple must guarantee two operands before any row comparisons can pass.
                Q[K] extends readonly [SetOperand, SetOperand, ...SetOperand[]]
                ? CheckOperands<Q[K]>
                : "set operations require at least two operands"
            : never
          : // Non-operation clauses retain their inferred types; SetQuery already constrains their shapes.
            unknown;
      } & {
        // Only the inferred output keys are legal here; expression ordering needs an outer SELECT.
        readonly orderBy?: CheckSetOrder<Q["orderBy"], keyof ReadQueryRow<FirstOperand<Q>>>;
      }
  : never;

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
  : S extends { readonly [exprBrand]: ExprBrand<unknown, any> }
    ? Expr<QueryRow<S, J> | null, never>
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
  : // A source-shaped select (`select: a`, `select: bookStats`) must be the `from`: a joined source's
    // rows would need left-join nullability (and entity hydration) that source-shaped selects don't
    // model. Two same-named sources (unnamed aliases of one entity, anonymous subqueries) pass this
    // check and are caught at runtime instead.
    [S] extends [QuerySource]
    ? NameOf<S> extends NameOf<F>
      ? unknown
      : { select: `'${NameOf<S> & string}' is a joined source, not the from; select its columns individually` }
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
 * Ordinary SELECT shapes share one signature: separate scalar/entity/POJO overloads hid `as` from
 * completions and cost 15-28% check time. The separate compound root has one additional signature;
 * `NotWidened` still rejects a SELECT widened by a `: Query` annotation.
 */
export function query<const Q extends SetQuery<readonly SetOperand[]>, Name extends string = "?">(
  q: Q & CheckSetQuery<Q> & { as?: Name },
): Subquery<SetQueryRow<Q>, Name>;
export function query<
  F extends QuerySource,
  S extends QuerySelect = never,
  J extends QueryJoins = [],
  Name extends string = "?",
>(q: QueryArg<F, S, J, Name>): QueryValue<S, J, Name>;
export function query(q: AnyReadQuery): unknown {
  const handle = new SubqueryHandle(toQuery(q));
  const output = handle.output();
  if (output.kind === "entity") {
    return { [entityQueryBrand]: handle } as any;
  } else if (output.kind === "scalar") {
    return new SubqueryExpr(handle) as any;
  } else {
    return newSubqueryProxy(handle) as any;
  }
}

/**
 * Builds a SQL expression from a tagged template.
 *
 * For an Author alias `a` assigned the SQL alias `a1`:
 *
 * ```ts
 * sql`${a.age} * 2`     // Expression: a1.age * 2
 * sql`${a.age.gte(18)}` // Condition: (a1.age >= ?), bindings [18]
 * sql`${"Alice"}`      // Value: ?, bindings ["Alice"]
 *
 * // Selecting this expression keeps the join to Book b.
 * sql<number>`${b.order} * ${2}`
 *
 * // Reference an unmodeled column; it is untracked at the type level.
 * sql.ref<string>(a, "ts_search")
 * sql.condition`${sql.ref(a, "ts_search")} @@ plainto_tsquery(${term})`
 * ```
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

/**
 * Parses `arg` (a `Query` POJO or `query(...)` value) into a runnable `Plan`.
 *
 * `EntityManager.query` runs the plan; this module deliberately does not import `EntityManager` (see
 * `EntityHydrator`), so it parses and hands back `{ sql, bindings, decodeRows }` instead of executing.
 */
export function parseUserQuery(arg: unknown): Plan {
  return parseQuery(toQuery(arg), undefined, new AliasAssigner());
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
  /** Ordered SQL output columns and their existing expression codecs, before JS row decoding. */
  output: QueryOutput;
  decodeRows(em: EntityHydrator, rows: any[]): any[];
}

// =====================================================================================================
// Runtime: handles, subquery expressions, the proxy
// =====================================================================================================

type AnyQuery = Query<any, any> & { as?: string };
type AnyReadQuery = AnyQuery | SetQuery<readonly SetOperand[]>;

/** Only POJO outputs can be set operands; ordinary scalar reads also expose an ordered output column. */
export interface QueryOutput {
  kind: "entity" | "scalar" | "pojo";
  columns: readonly (readonly [string, BaseExpr])[];
}

/** The runtime identity of a `query(...)` value; `Ctx.aliasFor` keys on it, like an alias's `AliasMgmt`. */
export class SubqueryHandle {
  constructor(readonly q: AnyReadQuery) {}

  get name(): string | undefined {
    return this.q.as;
  }

  /** The select keys, for `select: <subquery>` and for reporting unknown columns. */
  columnKeys(): string[] {
    const output = this.output();
    if (output.kind === "pojo") return output.columns.map(([key]) => key);
    return fail(`A subquery with an entity or scalar select has no columns`);
  }

  /** The inner expression behind `key`, for its decoder/encoder. */
  columnExpr(key: string): BaseExpr {
    return (
      this.output().columns.find(([name]) => name === key)?.[1] ??
      fail(`Subquery ${this.describe()} has no column ${key}`)
    );
  }

  /** Resolve output metadata without parsing SQL or caching aliases from an enclosing query. */
  output(): QueryOutput {
    return queryOutput(this.q);
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
    // safeKq for the alias too: a subquery's canonical alias is its user-provided `as` name
    return { sql: `${safeKq(alias)}.${safeKq(this.key)}`, bindings: [], refs: [alias] };
  }

  decode(value: unknown): unknown {
    return this.inner.decode(value);
  }

  encode(value: unknown): unknown {
    return this.inner.encode(value);
  }

  get outputType(): ExprOutputType | undefined {
    return this.inner.outputType;
  }
}

/**
 * A scalar (or IN-list) subquery, i.e. `query({ from: b, where: [...], select: b.id.count() })`.
 *
 * It closes over the outer aliases it references, so correlation is free; those references are the
 * subquery's "free" aliases and count toward the outer query's join pruning.
 */
class SubqueryExpr extends BaseExpr {
  constructor(readonly handle: SubqueryHandle) {
    super();
  }

  get subquerySelect(): BaseExpr {
    return this.handle.output().columns[0][1];
  }

  get outputType(): ExprOutputType | undefined {
    return this.subquerySelect.outputType;
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
    return this.subquerySelect.decode(value);
  }

  encode(value: unknown): unknown {
    return this.subquerySelect.encode(value);
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

function toQuery(arg: unknown): AnyReadQuery {
  if (isSubqueryValue(arg)) return arg[subqueryBrand].q;
  if (isEntityQueryValue(arg)) return arg[entityQueryBrand].q;
  if (arg instanceof SubqueryExpr) return arg.handle.q;
  if (isSetQuery(arg)) return arg;
  if (typeof arg === "object" && arg !== null && "from" in arg && "select" in arg) return arg as AnyQuery;
  return fail(`em.query expects a { from, select, ... } object or a query(...) value`);
}

const SET_OPERATIONS: Record<SetOperation, string> = {
  union: "UNION",
  unionAll: "UNION ALL",
  intersect: "INTERSECT",
  intersectAll: "INTERSECT ALL",
  except: "EXCEPT",
  exceptAll: "EXCEPT ALL",
};

/** Detect operation keys even when their values are invalid, so mixed roots cannot fall through to SELECT. */
function isSetQuery(value: unknown): value is SetQuery<readonly SetOperand[]> {
  return typeof value === "object" && value !== null && Object.keys(SET_OPERATIONS).some((key) => key in value);
}

/** Validate each root independently; no operand, including the left side of EXCEPT, can be pruned. */
function setOperands(q: SetQuery<readonly SetOperand[]>): [SetOperation, readonly SetOperand[]] {
  const keys = (Object.keys(SET_OPERATIONS) as SetOperation[]).filter((key) => key in q);
  if (keys.length !== 1) fail("A set query requires exactly one operation key");
  for (const key of Object.keys(q)) {
    if (key !== keys[0] && !["orderBy", "limit", "offset", "as"].includes(key)) {
      fail(`Set queries do not support '${key}'; put it in an operand or an outer query`);
    }
  }
  const operands = q[keys[0]];
  if (!Array.isArray(operands) || operands.length < 2) fail("Set operations require at least two operands");
  return [keys[0], operands];
}

/**
 * Resolve ordered output columns without rendering SQL. Set compatibility is deliberately conservative:
 * every column needs the same known SQL representation, logical domain, and precise ID target.
 *
 * I.e. Author.id and Book.author share the Author key codec, but Book.id must never decode as Author.id.
 * The first branch supplies names and conversions only after every branch passes these checks.
 */
function queryOutput(q: AnyReadQuery): QueryOutput {
  if (isSetQuery(q)) {
    const [, operands] = setOperands(q);
    const first = queryOutput(toQuery(operands[0]));
    for (const operand of operands) {
      const output = operand === operands[0] ? first : queryOutput(toQuery(operand));
      if (output.kind !== "pojo") {
        fail(
          output.kind === "entity"
            ? "Set operations do not support entity-mode operands"
            : "Set operations require POJO operands; wrap scalar expressions in a named select projection",
        );
      }
      if (output.columns.length !== first.columns.length) fail("Set operands must have the same POJO keys");
      for (const [key, expr] of first.columns) {
        const other = output.columns.find(([name]) => name === key)?.[1];
        if (!other) fail(`Set operands must have the same POJO keys; missing '${key}'`);
        const left = expr.outputType;
        const right = other.outputType;
        if (!left || !right)
          fail(
            `Set column '${key}' has an unknown or unsupported output codec; sql<R> does not declare a SQL type or codec`,
          );
        if (left.dbType !== right.dbType || left.domain !== right.domain || left.idMeta !== right.idMeta) {
          fail(
            `Set column '${key}' has incompatible output codecs (${left.dbType} and ${right.dbType}); use matching SQL representations and logical domains`,
          );
        }
      }
    }
    setOrderBys(q, first);
    return first;
  }
  const { select } = q;
  if (isAlias(select)) return { kind: "entity", columns: [] };
  if (isExpr(select)) return { kind: "scalar", columns: [["value", asNode(select)]] };
  if (isSubqueryValue(select)) return select[subqueryBrand].output();
  if (isPlainSelect(select))
    return {
      kind: "pojo",
      columns: Object.entries(select).map(([key, expr]) => [key, asExpr(expr, `select.${key}`)] as const),
    };
  return fail(`Unsupported select ${select}`);
}

/**
 * Compile siblings in separate local scopes with the same enclosing context. Projection wrappers align
 * output positions without moving DISTINCT/order/pagination or repeating volatile selected expressions.
 * Parenthesizing each accumulated left side preserves array association and explicit nested grouping.
 */
function parseSetQuery(q: SetQuery<readonly SetOperand[]>, parent: Ctx | undefined, assigner: AliasAssigner): Plan {
  const [operation, operands] = setOperands(q);
  const output = queryOutput(q);
  const plans = operands.map((operand) => parseQuery(toQuery(operand), parent, assigner));
  let sql = "";
  for (const plan of plans) {
    let branch = plan.sql;
    if (output.columns.some(([key], i) => plan.output.columns[i][0] !== key)) {
      const alias = safeKq(assigner.getLiteralAlias("sq"));
      branch = `SELECT ${output.columns.map(([key]) => `${alias}.${safeKq(key)} AS ${safeKq(key)}`).join(", ")} FROM (${branch}) AS ${alias}`;
    }
    sql = sql ? `(${sql}) ${SET_OPERATIONS[operation]} (${branch})` : branch;
  }
  const orderBys = setOrderBys(q, output);
  if (orderBys.length > 0) sql += ` ORDER BY ${orderBys.join(", ")}`;
  const bindings = plans.flatMap((plan) => plan.bindings);
  if (q.limit !== undefined) {
    sql += " LIMIT ?";
    bindings.push(q.limit);
  }
  if (q.offset !== undefined) {
    sql += " OFFSET ?";
    bindings.push(q.offset);
  }
  return {
    sql,
    bindings,
    outerRefs: [...new Set(plans.flatMap((plan) => plan.outerRefs))],
    output,
    decodeRows: plans[0].decodeRows,
  };
}

/** Validate and quote only named set output sorts, including before a reusable value is parsed. */
function setOrderBys(q: SetQuery<readonly SetOperand[]>, output: QueryOutput): string[] {
  const orderBys: string[] = [];
  for (const entry of Array.isArray(q.orderBy) ? q.orderBy : q.orderBy ? [q.orderBy] : []) {
    if (entry === undefined) continue;
    if (!entry || typeof entry !== "object" || isExpr(entry))
      fail("Set orderBy requires output-key hashes; use an outer query for expressions");
    for (const [key, direction] of Object.entries(entry)) {
      if (direction === undefined) continue;
      if (!output.columns.some(([name]) => name === key)) fail(`Set orderBy key '${key}' is not a named output column`);
      if (!ORDER_BY_DIRECTIONS.includes(direction as string))
        fail("Set orderBy requires output-key directions; use an outer query for expressions");
      orderBys.push(`${safeKq(key)} ${direction}`);
    }
  }
  return orderBys;
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
  /** Physical CTI table aliases (`sp_b0`) to their source alias (`sp`), shared across the whole parse. */
  readonly ctiAliases: Map<string, string>;

  constructor(
    readonly assigner: AliasAssigner,
    private parent: Ctx | undefined,
  ) {
    this.ctiAliases = parent?.ctiAliases ?? new Map();
  }

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
 * Parses one `Query` POJO into SQL, recursively for subqueries.
 *
 * 1. Register every source's runtime identity with its SQL alias in this parse's context.
 * 2. Generate SQL for sources, selects, conditions, group-bys, and order-bys against the context; every fragment
 *    reports the aliases it references.
 * 3. Prune: drop joins nothing references (see below), then reject a kept join whose ON collapsed.
 * 4. Assemble the SQL from the kept fragments, so pruned bindings disappear with their SQL.
 */
function parseQuery(q: AnyReadQuery, parent: Ctx | undefined, assigner: AliasAssigner): Plan {
  if (isSetQuery(q)) return parseSetQuery(q, parent, assigner);
  const ctx = new Ctx(assigner, parent);
  const selectedAlias = isAlias(q.select) ? getAliasMgmt(q.select) : undefined;
  const joinEntries = [...(q.join ?? [])].filter(isDefined);

  // 1. Register every source before generating SQL, so conditions can resolve their aliases.
  const parseFrom = registerSource(q.from, ctx, assigner, handleOf(q.from) === selectedAlias);
  const pendingJoins = joinEntries.flatMap((j) => {
    const kind = "inner" in j && j.inner ? ("inner" as const) : ("left" as const);
    const alias = kind === "inner" ? j.inner : j.left;
    const keep = j.keep ?? false;
    // Only collection sugar joins (o2m/m2m) filter soft-deletes, em.find's relation semantics:
    // references (m2o/o2o/poly) resolve soft-deleted entities, and explicit joins are the user's own
    const softDeletes = (j as any)[collectionJoin] === true;
    const target = { kind, keep, on: j.on, softDeletes, parseSource: registerSource(alias, ctx, assigner, false) };
    // A sugar m2m join (`a.tags.as(t)`) carries a hidden join-table join; emit it first, with the same kind
    const m2m: M2mJoinTable | undefined = (j as any)[m2mJoinTable];
    if (!m2m) return [target];
    return [
      { kind, keep, on: m2m.on, softDeletes: false, parseSource: registerJoinTable(m2m.handle, ctx, assigner) },
      target,
    ];
  });

  // 2. Generate SQL.
  const softDeletes = q.softDeletes ?? "exclude";
  const from = parseFrom();
  const joins: ParsedJoin[] = pendingJoins.map((j) => {
    const source = j.parseSource();
    // `userOn` is the user's ON alone, so the collapsed-ON check below is not fooled by injections
    const userOn = conditionToSql(j.on, ctx, true);
    const injected = injectedConditions(source, j.softDeletes ? softDeletes : "include");
    const fullOn = userOn && injected.length > 0 ? conditionToSql({ and: [j.on, ...injected] }, ctx, true) : userOn;
    return { kind: j.kind, keep: j.keep, source, userOn, fullOn };
  });
  const { selects, decodeRows, output } = selectsToSql(q, ctx, from);
  const fromInjected = injectedConditions(from, softDeletes);
  const where = conditionToSql(fromInjected.length > 0 ? { and: [q.where, ...fromInjected] } : q.where, ctx, true);
  const having = conditionToSql(q.having, ctx, true);
  const groupBys = (q.groupBy ?? []).map((g) => asExpr(g, "groupBy").toSql(ctx));
  const orderBys = orderBysToSql(q, ctx);

  // 3. Prune.
  const kept = pruneJoins(q, from, joins, [...selects, ...groupBys, ...orderBys, where, having].filter(isDefined));
  // Joins emit in declaration order, so an ON may only reference sources declared before it; a forward
  // reference would reach PG as invalid SQL ("missing FROM-clause entry"). Reordering is not offered:
  // it is not semantics-preserving once INNER and LEFT joins mix, and the caller's fix is trivial.
  const laterAliases = new Set(kept.map((j) => j.source.alias));
  for (const j of kept) {
    if (!j.userOn) {
      fail(
        `Join ${describeHandle(j.source.handle)} has no ON condition left (they all pruned), but the query still references it`,
      );
    }
    laterAliases.delete(j.source.alias);
    const forward = j.fullOn!.refs.find((r) => laterAliases.has(r));
    if (forward) {
      fail(
        `Join ${describeHandle(j.source.handle)} references '${forward}', which is joined later; move that join earlier in the join array`,
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
    // A CTI subtype's physical base-table joins go *inside* a parenthesized join item: the ON can
    // reference the base alias (i.e. `sp.id` renders as `sp_b0.id`), so the subtree must join first
    const source = j.source.extraJoins.length > 0 ? `(${j.source.sql} ${j.source.extraJoins.join(" ")})` : j.source.sql;
    out.push({
      sql: ` ${keyword} ${source} ON ${j.fullOn!.sql}`,
      bindings: [...j.source.bindings, ...j.fullOn!.bindings],
      refs: [],
    });
  }
  if (where) out.push({ sql: ` WHERE ${where.sql}`, bindings: where.bindings, refs: [] });
  if (groupBys.length > 0)
    out.push({ ...joinFragmentParts(groupBys, ", "), sql: ` GROUP BY ${groupBys.map((g) => g.sql).join(", ")}` });
  if (having) out.push({ sql: ` HAVING ${having.sql}`, bindings: having.bindings, refs: [] });
  if (orderBys.length > 0)
    out.push({ ...joinFragmentParts(orderBys, ", "), sql: ` ORDER BY ${orderBys.map((o) => o.sql).join(", ")}` });
  if (q.limit !== undefined) out.push({ sql: ` LIMIT ?`, bindings: [q.limit], refs: [] });
  if (q.offset !== undefined) out.push({ sql: ` OFFSET ?`, bindings: [q.offset], refs: [] });

  return {
    sql: out.map((o) => o.sql).join(""),
    bindings: out.flatMap((o) => o.bindings),
    outerRefs: [...ctx.outerRefs],
    output,
    decodeRows,
  };
}

/**
 * Assigns a SQL alias to a source and returns a function that parses it after all sources are registered.
 *
 * Conditions resolve source identities through the context when their SQL is generated. CTI entities
 * get their base/sub-table joins from `addTablePerClassJoinsAndClassTag`, and the entity-mode `select`
 * gets that helper's selects too.
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
    ctx.register(handle, alias);
    // Record the physical CTI table aliases this source emits (i.e. `sp_b0`), so `refsOf` can credit
    // their refs to this alias exactly; a user subquery named `book_b0` must not be mistaken for one
    if (meta.inheritanceType === "cti") {
      meta.baseTypes.forEach((_, i) => ctx.ctiAliases.set(`${alias}_b${i}`, alias));
      if (isPrimary) meta.subTypes.forEach((_, i) => ctx.ctiAliases.set(`${alias}_s${i}`, alias));
    }
    return () => {
      const cti: ParsedFindQuery = { selects: [], tables: [], orderBys: [] };
      addTablePerClassJoinsAndClassTag(cti, meta, alias, isPrimary);
      const extraJoins = cti.tables.map((t) => {
        if (t.join !== "outer") return fail(`Unexpected ${t.join} join for CTI`);
        return `LEFT OUTER JOIN ${kq(t.table)} AS ${kq(t.alias)} ON ${t.col1} = ${t.col2}`;
      });
      // Entity mode starts with the primary table's own columns (excluding lazy ones, like em.find)
      // and *appends* the CTI base/sub-table columns and the __class tag; the CTI selects alone would
      // drop the selected table's own fields, i.e. a Publisher would hydrate with an undefined name
      const primarySelects = meta.hasLazyColumns ? lazyExcludedSelects(meta, alias) : [kqStar(alias)];
      const entitySelects = [...primarySelects, ...(cti.selects as string[])];
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
): { selects: SqlFragment[]; decodeRows: Plan["decodeRows"]; output: QueryOutput } {
  const { select } = q;
  if (isAlias(select)) {
    // Entity mode: `a.*` (plus CTI columns), hydrated through the identity map. Only the from is
    // hydratable: a joined alias would need null-row skipping and left-join nullability (see TODO.md)
    if (from.handle !== getAliasMgmt(select)) {
      fail("Selecting a joined alias is not supported yet; select the from alias, or select its columns individually");
    }
    const alias = ctx.aliasFor(getAliasMgmt(select));
    const meta = getAliasMetadata(select);
    const selects = from.entitySelects.map((s) => ({ sql: s, bindings: [], refs: [alias] }));
    return {
      selects,
      decodeRows: (em, rows) => em.hydrate(meta.cstr as any, rows),
      output: { kind: "entity", columns: [] },
    };
  } else if (isSubqueryValue(select)) {
    // `select: <subquery>` is `select *` for that table; like entity mode, only for the from, since a
    // left-joined subquery's unmatched rows would decode null fields the row type calls non-null
    const handle = select[subqueryBrand];
    if (from.handle !== handle) {
      fail(
        "Selecting a joined subquery is not supported; select the from subquery, or select its columns individually",
      );
    }
    const alias = ctx.aliasFor(handle);
    const output = handle.output();
    const selects = output.columns.map(([k]) => ({
      sql: `${safeKq(alias)}.${safeKq(k)} AS ${safeKq(k)}`,
      bindings: [],
      refs: [alias],
    }));
    return {
      selects,
      decodeRows: (_, rows) => rows.map((row) => decodeRow(row, output.columns)),
      output,
    };
  } else if (isExpr(select)) {
    // Scalar mode: one value per row, used by scalar/IN-list subqueries
    const fragment = asNode(select).toSql(ctx);
    const selects = [{ ...fragment, sql: `${fragment.sql} AS value` }];
    return {
      selects,
      decodeRows: (_, rows) => rows.map((row) => asNode(select).decode(row.value)),
      output: { kind: "scalar", columns: [["value", asNode(select)]] },
    };
  } else if (isPlainSelect(select)) {
    // POJO mode
    const entries = Object.entries(select).map(([key, expr]) => [key, asExpr(expr, `select.${key}`)] as const);
    const selects = entries.map(([key, expr]) => {
      const fragment = expr.toSql(ctx);
      return { ...fragment, sql: `${fragment.sql} AS ${safeKq(key)}` };
    });
    return {
      selects,
      decodeRows: (_, rows) => rows.map((row) => decodeRow(row, entries)),
      output: { kind: "pojo", columns: entries },
    };
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

/**
 * Generates ORDER BY SQL in entry order for keyed/expression arrays or a single keyed object.
 *
 * Expression entries retain bindings and alias references for join pruning. Undefined entries and
 * directions are omitted.
 */
function orderBysToSql(q: AnyQuery, ctx: Ctx): SqlFragment[] {
  const { orderBy, select } = q;
  if (!orderBy) return [];
  const result: SqlFragment[] = [];
  for (const entry of Array.isArray(orderBy) ? orderBy : [orderBy]) {
    if (entry === undefined) continue;
    // A select key can also be named asc or desc, so distinguish entries by their values, not their keys.
    if (isExpr(entry.asc) || isExpr(entry.desc)) {
      result.push(orderByToSql(entry, ctx));
      continue;
    }
    for (const [key, dir] of Object.entries(entry)) {
      if (dir === undefined) continue;
      // The direction is interpolated into the SQL, so never trust it, i.e. it might be a request param
      if (!ORDER_BY_DIRECTIONS.includes(dir as string)) return fail(`Invalid orderBy direction '${dir}'`);
      // Entity mode orders by the alias's column; POJO/subquery selects order by the output column name
      if (isAlias(select)) {
        const column = (select as any)[key];
        if (!isExpr(column)) return fail(`orderBy key '${key}' is not a sortable field of the entity`);
        const fragment = asNode(column).toSql(ctx);
        result.push({ ...fragment, sql: `${fragment.sql} ${dir}` });
      } else {
        if (isExpr(select)) return fail(`the keyed orderBy form needs a POJO or entity select`);
        const keys = isSubqueryValue(select) ? select[subqueryBrand].columnKeys() : Object.keys(select as object);
        if (!keys.includes(key)) return fail(`orderBy key '${key}' is not a key of select`);
        result.push({ sql: `${safeKq(key)} ${dir}`, bindings: [], refs: [] });
      }
    }
  }
  return result;
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
  cond = resolveDeferredConditions(cond, ctx)!;
  const filter: ExpressionFilter = isFilter(cond) ? cond : { and: [cond] };
  const cb = new ConditionBuilder();
  cb.maybeAddExpression(filter);
  const parsed = cb.toExpressionFilter();
  if (!parsed) return undefined;
  const where = buildWhereClause(parsed, topLevel);
  if (!where) return undefined;
  return { sql: where[0], bindings: where[1], refs: refsOf(parsed, ctx) };
}

function isFilter(cond: ExpressionCondition): cond is ExpressionFilter {
  return ("and" in cond && cond.and !== undefined) || ("or" in cond && cond.or !== undefined);
}

/** The aliases a parsed condition tree references, with physical CTI aliases credited to their source. */
function refsOf(parsed: ParsedExpressionFilter, ctx: Ctx): string[] {
  return deepFindConditions(parsed, false)
    .flatMap((c) => (c.kind === "column" ? [c.alias] : c.kind === "raw" ? c.aliases : c.outerAliases))
    .map((a) => ctx.ctiAliases.get(a) ?? a);
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
    const refs = [...(j.userOn?.refs ?? []), ...j.source.refs].filter((r) => r !== j.source.alias);
    deps.set(j.source.alias, refs);
  }
  const required = new Set<string>();
  function markRequired(alias: string): void {
    if (required.has(alias)) return;
    required.add(alias);
    for (const dep of deps.get(alias) ?? []) markRequired(dep);
  }
  markRequired(from.alias);
  for (const r of used.flatMap((u) => u.refs)) markRequired(r);
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

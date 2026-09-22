import type { Entity } from "src/Entity.ts";
import { type EntityMetadata, getBaseMeta } from "src/EntityMetadata.ts";
import { ConditionBuilder } from "src/queries/ConditionBuilder.ts";
import {
  type ConditionGroup,
  type ConditionInput,
  type SqlCondition,
  type SqlPredicate,
  type UnbrandedPredicate,
  predicateBrand,
} from "src/queries/conditions.ts";
import { filterSoftDeletes, lazyExcludedSelects, stiSubtypeFilter } from "src/queries/entityQueryUtils.ts";
import { isDeferredAliasCondition } from "src/queries/find/DeferredAlias.ts";
import { type ColumnCondition, type ParsedExpressionFilter, deepFindConditions } from "src/queries/parsedConditions.ts";
import { buildWhereClause } from "src/queries/renderConditions.ts";
import { skipCondition } from "src/queries/skipCondition.ts";
import { AliasAssigner } from "src/queries/sql/AliasAssigner.ts";
import {
  BaseExpr,
  type Expr,
  type ExprContext,
  type ExprLike,
  type InnerJoin,
  type LeftJoin,
  type SqlFragment,
  TemplateExpr,
  asNode,
  deferredCondition,
  deferredSym,
  exprBrand,
  isExpr,
  orderByToSql,
  resolveDeferredConditions,
  selectKeyBrand,
} from "src/queries/sql/Expr.ts";
import {
  type CheckInput,
  type ExprFromInput,
  type ExprInput,
  type ExpressionSources,
  type ExpressionValue,
  buildExpr,
} from "src/queries/sql/expressions/expression.ts";
import { type CheckJoinInput, type TreeEntries, compileJoinTree } from "src/queries/sql/JoinTree.ts";
import { kq, kqStar, safeKq } from "src/queries/sql/keywords.ts";
import {
  type InQueryCondition,
  JoinTableHandle,
  type M2mJoinTable,
  type Table,
  type TableBrand,
  type TableFor,
  type TableMgmt,
  type TableSourceBrand,
  type TableSourceMgmt,
  collectionJoin,
  getTableMetadata,
  getTableMgmt,
  inQueryCondition,
  isEntityTable,
  isTable,
  m2mJoinTable,
  referenceJoinSource,
  tableMgmt,
} from "src/queries/sql/Tables.ts";
import type { TypeInfo } from "src/serde/TypeInfo.ts";
import { fail } from "src/utils.ts";

/**
 * `em.query`: SQL-shaped queries as plain object literals.
 *
 * A query is data, a `Query<S, J>` POJO, `{ from, join, where, groupBy, having, select, orderBy, ... }`
 * in SQL evaluation order:
 *
 *   const [a, b] = tables(Author, Book);
 *   const bookStats = query({ from: b, groupBy: [b.author_id], select: { authorId: b.author_id, n: b.id.count() } });
 *   const rows = await em.query({
 *     from: a,
 *     join: [{ left: bookStats, on: bookStats.authorId.eq(a.id) }],
 *     select: { name: a.first_name, n: bookStats.n },
 *     orderBy: { n: "DESC" },
 *   });
 *   // rows: { name: string; n: number | undefined }[]   (undefined because of the LEFT join)
 *
 * `em.query(pojo)` runs it. `select` decides the row type: a bare table returns entities, an array of
 * columns or a `{ key: expr }` object returns typed POJOs, and a bare subquery returns its rows.
 *
 * `query(pojo)` turns the *same* POJO into a value: a derived table with typed columns, a scalar
 * expression, or an entity list. It is the one non-POJO step, and the subquery analog of `table(Author)`:
 * to reference a query's columns, the outer query needs *values* for them, and no POJO can manufacture
 * values keyed off its own `select` keys.
 *
 * `table()`/`tables()` and `query()` are the only free functions a query needs, plus the `sql` tagged
 * template as the escape hatch for SQL with no modeled shape. Everything else is in-DSL: join kinds are
 * keyword keys (`{ left: b, on }`), SQL functions are methods on
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
export const scalarQueryBrand: unique symbol = Symbol("joist.scalarQuery");

/** A query(...) value with any projection, for EXISTS and NOT EXISTS predicates. */
export type ExistsQuery = Subquery<unknown, string> | EntityQuery<Entity> | { readonly [scalarQueryBrand]: true };

/**
 * A condition for a query's where, having, or join on clause. Combine conditions with and/or,
 * or use exists/notExists to check whether a query(...) value returns any rows.
 *
 * I.e. `{ and: [a.age.gte(18), { exists: booksForAuthor }] }` selects adult Authors with Books,
 * where `booksForAuthor` is `query({ from: b, where: b.author_id.eq(a.id), select: b.id })`.
 */
export type QueryCondition =
  | SqlPredicate
  | UnbrandedPredicate
  | ((
      | { and: readonly (QueryCondition | undefined)[]; or?: never; exists?: never; notExists?: never }
      | { or: readonly (QueryCondition | undefined)[]; and?: never; exists?: never; notExists?: never }
    ) & { pruneIfUndefined?: "any" | "all" })
  | { exists: ExistsQuery | undefined; notExists?: never; and?: never; or?: never }
  | { notExists: ExistsQuery | undefined; exists?: never; and?: never; or?: never };

/** Phantom type information carried by a table-shaped subquery. */
export interface SubqueryBrand<R, Name extends string> {
  readonly __row: R;
  readonly __name: Name;
}

/** Anything that can be a source or be joined: an entity table or a table-shaped subquery. */
export type QuerySource =
  | { readonly [tableMgmt]: TableSourceBrand<string> }
  | { readonly [subqueryBrand]: SubqueryBrand<any, string> };

/** A generated entity table or table-shaped subquery that supports `select: source`. */
type SelectableQuerySource =
  | { readonly [tableMgmt]: TableBrand<any, string> }
  | { readonly [subqueryBrand]: SubqueryBrand<any, string> };

/**
 * A join entry (see `InnerJoin`/`LeftJoin` in `Expr.ts`): the expanded `{ inner: b, on }` form, or the
 * entry a relation join factory returns (`a.books.as(b)`); joins to a subquery are always the expanded
 * form, since a subquery has no FK metadata.
 */
export type QueryJoin = InnerJoin<QuerySource, QueryCondition> | LeftJoin<QuerySource, QueryCondition>;
export type QueryJoinList = readonly (QueryJoin | undefined)[];

/** A flat SQL join list or a domain relationship tree rooted at from. */
export type QueryJoinInput = QueryJoinList | Readonly<Record<string, unknown>>;

/**
 * Resolves tree bindings to join types for scope and result nullability.
 * Deferring the extracted entry union avoids expanding recursive constraints in generic query signatures.
 */
export type ResolvedJoins<F, J> = J extends QueryJoinList
  ? J
  : F extends TableFor<infer T extends Entity>
    ? TreeEntries<T, J> extends infer E
      ? readonly Extract<E, QueryJoin>[]
      : never
    : [];

/**
 * A CTE declaration: a `query(...)` value with named columns, i.e. a POJO or set-operation select.
 *
 * Entity-mode and scalar `query(...)` shapes are excluded: a CTE must be a table shape, so it needs
 * columns.
 */
export type WithSource = Subquery<unknown, string>;

/** One CTE or an array of them; an `undefined` entry prunes, like any other clause. */
export type WithInput = WithSource | readonly (WithSource | undefined)[];

/** How a recursive CTE combines its two terms: `UNION ALL` keeps every row, `UNION` drops duplicates. */
export interface RecursiveOptions {
  /** Defaults to `"all"`. `"distinct"` emits UNION, which stops a cyclic graph from looping forever. */
  union?: "all" | "distinct";
}

/** An expression order-by entry. An undefined order prunes the complete entry. */
export type ExpressionOrderBy = {
  readonly sort: ExprLike<unknown>;
  readonly order: "ASC" | "DESC" | undefined;
  readonly nulls?: "first" | "last";
};

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
 * in `select`, mix in `{ sort, order }` entries in the array form.
 */
export type OrderByKeys<S> =
  // If S is an array select, allow ordering by each selected column's field name.
  S extends readonly NamedSelectExpression[]
    ? { readonly [K in SelectKey<S[number]>]?: OrderByDirection | undefined }
    : // Otherwise, if this is `select: a` entity mode, allow ordering by the entity's expression fields.
      S extends { readonly [tableMgmt]: { readonly __entity: infer T } }
      ? T extends Entity
        ? {
            readonly [K in keyof Table<T> as Table<T>[K] extends ExprLike<any> ? K : never]?:
              | OrderByDirection
              | undefined;
          }
        : never
      : // Otherwise, a scalar expression select has no named result fields to order by.
        S extends ExprLike<unknown>
        ? never
        : // Otherwise, this is POJO mode, so allow ordering by its select keys.
          { readonly [K in keyof S & string]?: OrderByDirection | undefined };

/** All sortable keys across select variants, not just the keys shared by every variant. */
type OrderByKey<S> = S extends unknown ? keyof OrderByKeys<S> : never;

/** Prevents a selected keyed sort from being silently mixed into an expression entry. */
type CheckedExpressionOrderBy<S> = ExpressionOrderBy &
  (string extends OrderByKey<S>
    ? unknown
    : [S] extends [{ readonly [tableMgmt]: unknown }]
      ? unknown
      : { readonly [K in Exclude<OrderByKey<S>, keyof ExpressionOrderBy>]?: never });

/** The select shapes: a source, scalar expression, named column array, or POJO naming result columns. */
export type QuerySelect =
  | SelectableQuerySource
  | ExprLike<unknown>
  | readonly NamedSelectExpression[]
  | Record<string, SelectExpression>;

/** A named projection value may be an existing expression or an inline expression literal. */
export type SelectExpression = ExprLike<unknown> | ExprInput;

/** A physical or subquery column that retains the field name used for array-select result rows. */
export type NamedSelectExpression = ExprLike<unknown> & { readonly [selectKeyBrand]: string };

/** Extracts the table property name carried by a column expression for array selects. */
type SelectKey<S> = S extends { readonly [selectKeyBrand]: infer K extends string } ? K : never;

/** Checks expression literals only inside named projections. */
type CheckSelect<S> = S extends QuerySource | ExprLike<unknown> | readonly NamedSelectExpression[]
  ? unknown
  : { readonly [K in keyof S]: S[K] extends ExprInput ? CheckInput<S[K]> : unknown };

/**
 * Everything but the source, in SQL evaluation order: FROM/JOIN, WHERE, GROUP BY, HAVING, SELECT,
 * ORDER BY, LIMIT.
 *
 * `S` and `J` are generic so callers keep the literal shape of `select` and `join`; the defaults let
 * a standalone object use `satisfies Query` (or `satisfies Clauses` for a source-less fragment).
 */
export interface Clauses<S extends QuerySelect = QuerySelect, J extends QueryJoinInput = QueryJoinInput> {
  /**
   * CTEs to include in a `WITH` clause, declared as `query(...)` values; either a single value or an array.
   *
   * I.e. `{ with: bookStats, from: a, join: [{ left: bookStats, on: ... }], select: { n: bookStats.n } }`.
   *
   * An `undefined` entry is ignored, and a CTE that nothing else in the query references will be pruned,
   * the same pruning `join` gets (see "Pruning"); `pruneJoins: false` keeps every CTE.
   */
  with?: WithInput;
  /** A flat join list, or a domain relationship tree rooted at the entity table in from. */
  join?: J;
  /**
   * An `{ and: [...] }` or `{ or: [...] }` group, an exists/notExists query, or a bare condition such as `a.age.gte(18)`.
   *
   * Arrays are shorthand for `{ and: [...] }`; undefined conditions are pruned.
   */
  where?: QueryCondition | readonly (QueryCondition | undefined)[];
  groupBy?: readonly ExprLike<any>[];
  having?: QueryCondition;
  select: S;
  orderBy?: readonly (CheckedExpressionOrderBy<S> | OrderByKeys<S> | undefined)[] | OrderByKeys<S>;
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
export interface Query<S extends QuerySelect = QuerySelect, J extends QueryJoinInput = QueryJoinInput>
  extends Clauses<S, J>, Partial<Record<SetOperation | MutationKey | "ctes", never>> {
  from: QuerySource;
}

/**
 * The six PostgreSQL set operations. Each compound root has exactly one operation.
 *
 * I.e. `union` removes duplicate projected Author names; `unionAll` keeps every copy.
 */
export type SetOperation = "union" | "unionAll" | "intersect" | "intersectAll" | "except" | "exceptAll";

/** Mutation clauses are forbidden even on nonliteral read inputs. */
type MutationKey = "insert" | "update" | "delete" | "values" | "set" | "returning" | "allowAll";

/**
 * For set operations like UNION, this is one read operand with named POJO columns: an ordinary query,
 * a reusable query value, or another compound.
 * Scalar queries, expressions, and entity hydration are excluded.
 *
 * I.e. `{ from: a, select: { id: a.id } }` and its `query(...)` value can contribute Author IDs to a
 * union. `{ from: a, select: a.id }` cannot: even one-column set operands must give that column a name.
 */
export type SetOperand =
  | Query<Record<string, SelectExpression> | Subquery<unknown, string>>
  | Subquery<unknown, string>
  | SetQuery<readonly SetOperand[]>;

/**
 * SQL-shaped compound input; use `satisfies SetQuery` to retain the operands' literal row types.
 *
 * I.e. for Author alias `a` and Book alias `b`:
 * ```ts
 * const names = {
 *   union: [
 *     { from: a, select: { name: a.first_name } },
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
  /** CTEs for the combined query, declared once and in scope for every operand; see `Clauses.with`. */
  readonly with?: WithInput;
  readonly orderBy?:
    | Readonly<Record<string, OrderByDirection | undefined>>
    | readonly (Readonly<Record<string, OrderByDirection | undefined>> | undefined)[];
  readonly limit?: number;
  readonly offset?: number;
  readonly as?: string;
} & {
  // SELECT clauses and branch policies must stay inside operands or an ordinary outer query.
  readonly [
    K in
      | "from"
      | "select"
      | "join"
      | "where"
      | "groupBy"
      | "having"
      | "distinct"
      | "softDeletes"
      | "pruneJoins"
      | MutationKey
      | "ctes"
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
 * `{ title: string | undefined }`, even though Book.title is required. A reusable `query(...)` value already
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
        QueryRow<
          S,
          ResolvedJoins<Q[keyof Q & "from"], "join" extends keyof Q ? Extract<Q[keyof Q & "join"], QueryJoinInput> : []>
        >
      : [OperandsOf<Q>] extends [never]
        ? never
        : SetQueryRow<Q>;

/**
 * UNION combines each column's values; INTERSECT and EXCEPT conservatively retain the left row.
 *
 * I.e. Author first names projected as `{ name: string }` unioned with LEFT-joined Book titles projected
 * as `{ name: string | undefined }` produce `{ name: string | undefined }`. EXCEPT with those Author names on
 * the left retains `{ name: string }`; it neither adds the right side's absence nor promises narrower values.
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
export type CompatibleValue<L, R> = [NonNullable<L>] extends [NonNullable<R>]
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
      : CheckReadQuery<Q>
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
      } & CheckReadQuery<Q> & {
          // Only the inferred output keys are legal here; expression ordering needs an outer SELECT.
          readonly orderBy?: CheckSetOrder<Q["orderBy"], keyof ReadQueryRow<FirstOperand<Q>>>;
        }
  : never;

/**
 * Rejects unknown clauses on concrete read inputs, recursively through compound operands.
 * Intersect this with an inferred Q; a widened annotation cannot reveal keys already erased from its type.
 * I.e. an INSERT source with `select: { title: b.title }` and `ctes: [...]` must not silently discard the CTEs.
 */
export type CheckReadQuery<Q> = SetOperand extends Q
  ? unknown
  : Q extends readonly unknown[]
    ? { readonly [I in keyof Q]: CheckReadQuery<Q[I]> }
    : Q extends { readonly [subqueryBrand]: SubqueryBrand<infer R, string> }
      ? { readonly [K in keyof Q]: K extends keyof R | typeof subqueryBrand ? unknown : never }
      : Q extends { readonly [entityQueryBrand]: unknown }
        ? { readonly [K in keyof Q]: K extends typeof entityQueryBrand ? unknown : never }
        : Q extends { readonly from: unknown; readonly select: unknown }
          ? CheckJoinInput<Q["from"], "join" extends keyof Q ? Exclude<Q[keyof Q & "join"], undefined> : []> & {
              readonly [K in keyof Q]: K extends "select"
                ? CheckSelect<Q[K]>
                : K extends keyof Clauses | "from" | "as"
                  ? unknown
                  : never;
            }
          : {
              readonly [K in keyof Q]: K extends SetOperation
                ? Q[K] extends readonly unknown[]
                  ? CheckReadQuery<Q[K]>
                  : unknown
                : K extends "with" | "orderBy" | "limit" | "offset" | "as"
                  ? unknown
                  : never;
            };

// =====================================================================================================
// Result-row types
// =====================================================================================================

/** The type-level name of a table or subquery, i.e. `"Author"` or `"book_stats"`. */
export type NameOf<A> = A extends { readonly [tableMgmt]: { readonly __name: infer N } }
  ? N
  : A extends { readonly [subqueryBrand]: { readonly __name: infer N } }
    ? N
    : never;

/** The names of every alias that was LEFT JOINed; `X` is a naked type parameter so this distributes. */
type LeftJoined<X> = X extends LeftJoin<infer A> ? NameOf<A> : never;

/** Adds default reference targets whose source is already nullable; explicit INNER joins do not inherit. */
type InheritedLeft<X, Left> = X extends { readonly [referenceJoinSource]: infer Src; readonly inner: infer A }
  ? // Extract finds this reference's source among nullable aliases. No overlap means its target stays INNER.
    // I.e. Src = "Book" and Left = "Book" adds NameOf<A> = "Author"; Left = "Publisher" adds nothing.
    [Extract<Src, Left>] extends [never]
    ? never
    : NameOf<A>
  : never;

/**
 * Finds all aliases that can be NULL through LEFT joins and subsequent reference joins.
 * I.e. LEFT Book adds Author via Book.author.as(a), then further required references inherit Author's NULL.
 * Alias-name collisions are conservative, as they are for explicit LEFT joins; runtime uses exact handles.
 */
type NullableSources<X, Left = LeftJoined<X>> =
  // X is J[number], the union of entries in em.query's `join: [...]` array. A variable like
  // `const joins = [j1, j2]` normally infers an array, not a tuple, so this recursive conditional type
  // works over that union instead of walking tuple positions. LeftJoined<X> seeds Left with the aliases
  // from `left: ...` entries. InheritedLeft<X, Left> discovers reference targets whose sources are in Left.
  // Exclude removes names already in Left. If all were already known, stop recursing and use Left as the value;
  // otherwise, add the newly discovered LEFT-joined aliases to our set and recurse.
  [Exclude<InheritedLeft<X, Left>, Left>] extends [never] ? Left : NullableSources<X, Left | InheritedLeft<X, Left>>;

/**
 * Asks: is this expression's source key among the LEFT-joined sources in this query's join list? If
 * yes, SQL can return NULL, so `R` becomes `R | null`; if no, `R` is unchanged.
 *
 * I.e. `MaybeNull<number, "book_stats", [LeftJoin<typeof bookStats>]>` is `number | null`,
 * because `book_stats` is in `NullableSources<J[number]>`; with an inner join it stays `number`.
 * Default references from nullable sources are included transitively.
 *
 * Source-less expressions (`Src` is `never`, i.e. `b.id.count()`) are never nullified. Untracked ones
 * (`Src` is `string`, i.e. a table whose entity type is not statically known) might come from any left-joined table,
 * so they are conservatively nullified whenever the query has a left join at all.
 *
 * `string` must never be a *table's* name: `Extract<"Author", string>` matches, so one left-joined
 * table named `string` would nullify every column in the query. That is why anonymous subqueries
 * share the literal sentinel `"?"` instead.
 */
export type MaybeNull<R, Src extends string, J extends QueryJoinList> = string extends Src
  ? [NullableSources<J[number]>] extends [never]
    ? R
    : R | null
  : [Extract<Src, NullableSources<J[number]>>] extends [never]
    ? R
    : R | null;

/**
 * The result row for a query with select `S` and joins `J`.
 *
 * - entity mode (`select: a`) is the entity
 * - subquery mode (`select: bookStats`) is the subquery's row, i.e. `select *`
 * - single expression (`select: b.id.count()`) is that expression's value, used by scalar subqueries
 * - column array mode uses each column's field name as the result key
 * - POJO mode is a mapped type over the select keys, with left-join nullability applied
 */
export type QueryRow<S, J extends QueryJoinList = []> = S extends {
  readonly [tableMgmt]: { readonly __entity: infer T };
}
  ? T
  : S extends { readonly [subqueryBrand]: { readonly __row: infer R } }
    ? R
    : S extends ExprLike<unknown>
      ? QueryResultValue<ExpressionValue<S, J>>
      : // If S is an array select, use each column's field name as its result key.
        S extends readonly NamedSelectExpression[]
        ? {
            // Map each selected column to its field name and decoded value type. Remove readonly because
            // const-tuple inference is an input detail and must not make returned row properties readonly.
            -readonly [E in S[number] as SelectKey<E>]: QueryResultValue<ExpressionValue<E, J>>;
          }
        : {
            // Inline inputs retain readonly tuples for inference; result rows are still mutable.
            -readonly [K in keyof S]: S[K] extends SelectExpression
              ? QueryResultValue<ExpressionValue<S[K] extends ExprInput ? ExprFromInput<S[K]> : S[K], J>>
              : never;
          };

/**
 * Converts top-level SQL NULL to Joist's public undefined convention.
 *
 * Column metadata and expressions retain `T | null` because null is an explicit SQL value used by
 * predicates, assignments, and functions such as COALESCE. Undefined instead means an omitted input.
 * Keeping that distinction also lets reusable queries become SQL expressions without changing domains.
 * The conversion therefore happens only at the executed-row boundary; nested array and JSON nulls remain null.
 */
type QueryResultValue<V> = Exclude<V, null> | (null extends V ? undefined : never);

/**
 * Restores SQL NULL when a public query result is reused as an expression or mutation source.
 *
 * A future alternative is to retain both domains on every expression, i.e.
 * `Expr<Sql, Src extends string = string, Result = QueryResultValue<Sql>>`. QueryRow could then use Result
 * while predicates and reusable queries use Sql, avoiding this reverse conversion without making the
 * common expression declaration verbose.
 */
export type SqlExpressionValue<V> = Exclude<V, undefined> | (undefined extends V ? null : never);

// =====================================================================================================
// `query()`: a query POJO becomes a typed table, scalar, or entity list
// =====================================================================================================

/**
 * A table-shaped query: one `Expr` per select key, each tagged with the table's name as its `Src`,
 * plus a brand carrying the row type. This is the direct analog of `Table<T>`: `Table<T>` maps physical
 * columns to expressions, `Subquery<Row, Name>` maps the inner query's select keys to expressions.
 */
export type Subquery<R, Name extends string> = {
  readonly [subqueryBrand]: SubqueryBrand<R, Name>;
} & {
  // For each field in row shape R, i.e. `firstName` in `{ firstName: string }`, expose an expression
  // that retains the field name for array selects.
  readonly [K in keyof R]: Expr<SqlExpressionValue<R[K]>, Name> & { readonly [selectKeyBrand]: Extract<K, string> };
};

/** An entity-mode query (`select: a`): runnable, but it has no columns to reference. */
export type EntityQuery<T extends Entity> = { readonly [entityQueryBrand]: { readonly __row: T } } & Partial<
  Record<MutationKey | "with" | "ctes", never>
>;

/** A scalar/list query that remains distinguishable from ordinary expressions for EXISTS. */
export type ScalarQuery<R> = Expr<SqlExpressionValue<R> | null, never> & { readonly [scalarQueryBrand]: true };

/**
 * Rejects a `select` that a `: Query` annotation widened to the whole `QuerySelect` union.
 *
 * `satisfies Query` checks the shape but keeps the literal type of `select`, so `S` infers as
 * `{ name: Expr<string, "Author"> }`. A `: Query` annotation replaces that type with the annotation, so
 * `S` infers as `QuerySelect` itself, and without this guard `query(q)` returned a useless union with no
 * error at all.
 *
 * A widened `S` is the only kind of `S` the whole `QuerySelect` union is assignable to (a POJO, an
 * `Expr`, or a `Table` never is), so `QuerySelect extends S` detects it, and intersecting the parameter
 * with `{ select: "<message>" }` fails the call on `select` with that message, for `query()` and
 * `em.query()` alike:
 *
 *   const narrow = { from: a, select: { name: a.first_name } } satisfies Query;
 *   query(narrow); // Subquery<{ name: string }, "?">
 *
 *   const widened: Query = { from: a, select: { name: a.first_name } };
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
export type QueryValue<S, J extends QueryJoinList, Name extends string> = S extends {
  readonly [tableMgmt]: { readonly __entity: infer T extends Entity };
}
  ? EntityQuery<T>
  : S extends ExprLike<unknown>
    ? ScalarQuery<QueryRow<S, J>>
    : Subquery<QueryRow<S, J>, Name>;

/** The names of every alias in scope for a query: the source alias plus every joined alias. */
type JoinedName<X> = X extends { readonly inner: infer A }
  ? NameOf<A>
  : X extends { readonly left: infer A }
    ? NameOf<A>
    : never;
type InScope<F, J extends QueryJoinList> = NameOf<F> | JoinedName<J[number]>;

/**
 * Asks, for every column of a POJO select: is its source key among `from` + `join` at all? If no, the
 * query reads from a table it never joined, and that select key's type becomes an error message.
 *
 * Because `Expr` already carries `Src`, this is nearly free: for each select key, if `Src` is tracked
 * and any of its names is outside `InScope`, intersect that key's type with an error string, so the
 * caller sees `Type 'Expr<number, "book_stats">' is not assignable to type '... is not in from/join'`.
 * Untracked (`string`) and source-less (`never`) expressions always pass. Tables with the same
 * type-level name (two bare `table(Author)`, or two anonymous tables) cannot be told apart, so a miss
 * there goes unreported; the check never gives a false positive, only false negatives on collisions.
 *
 * `[S] extends [...]` keeps this non-distributive, and `never` is skipped outright: `query()` defaults
 * `S` to `never` when `select` is missing, and a distributive conditional over `never` would swallow the
 * whole parameter type.
 */
export type CheckScope<S, F, J extends QueryJoinInput> = [S] extends [never]
  ? unknown
  : // A source-shaped select (`select: a`, `select: bookStats`) must be the `from`: a joined source's
    // rows would need left-join nullability (and entity hydration) that source-shaped selects don't
    // model. Two same-named sources (unnamed aliases of one entity, anonymous subqueries) pass this
    // check and are caught at runtime instead.
    [S] extends [QuerySource]
    ? NameOf<S> extends NameOf<F>
      ? unknown
      : { select: `'${NameOf<S> & string}' is a joined source, not the from; select its columns individually` }
    : [S] extends [readonly NamedSelectExpression[]]
      ? // For an array select, verify that every selected column belongs to a source in from/join.
        {
          select: { [K in keyof S]: CheckExpressionScope<S[K], InScope<F, ResolvedJoins<F, J>>> };
        }
      : [S] extends [Record<string, SelectExpression>]
        ? // For a POJO select, verify that every named expression uses only sources in from/join.
          {
            select: {
              [K in keyof S]: CheckExpressionScope<S[K], InScope<F, ResolvedJoins<F, J>>>;
            };
          }
        : unknown;

/** Includes columns nested in inline CASE values and fallbacks in the existing scope check. */
type CheckExpressionScope<V, Scope> =
  string extends ExpressionSources<V>
    ? unknown
    : [Exclude<ExpressionSources<V>, Scope>] extends [never]
      ? unknown
      : `table '${Exclude<ExpressionSources<V>, Scope> & string}' is not in from/join`;

/** The one argument type `query()` and `em.query()` share: a `Query` POJO plus its source, name, and checks. */
export type QueryArg<
  F extends QuerySource,
  S extends QuerySelect,
  J extends QueryJoinInput,
  Name extends string,
> = Query<S, J> & {
  from: F;
  as?: Name;
} & CheckScope<S, F, J> &
  NoInfer<CheckJoinInput<F, J>> &
  NotWidened<S> & { select: CheckSelect<NoInfer<S>> };

/**
 * Turns a `Query` POJO into a value. The select shape decides which (`QueryValue`):
 *
 * - a single expression is a scalar subquery or an IN list (`Expr<R | null>`; a scalar subquery can
 *   return no row, so use `.coalesce(0)` when the SQL guarantees a value, i.e. an ungrouped `count`)
 * - an entity table is an entity list, runnable via `em.query`
 * - a POJO is a derived table whose columns are `Expr`s; it can be a source, be joined, or be run
 *
 * `as` is the SQL alias and the type-level identity, the same role the second argument of
 * `table(Author, "m")` plays. Without it the SQL alias is generated, like `table(Author)`, and all
 * anonymous tables share the type-level identity `"?"`: precise against every named alias, and
 * conservative (a left-joined anonymous table nullifies every anonymous table's columns) only among
 * themselves. This is the same collision two bare `table(Author)` have.
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
  const S extends QuerySelect = never,
  J extends QueryJoinInput = [],
  Name extends string = "?",
>(q: QueryArg<F, S, J, Name>): QueryValue<S, ResolvedJoins<F, J>, Name>;
export function query(q: AnyReadQuery): unknown {
  return createQueryValue(q);
}

/**
 * Builds a query value only when its user-supplied `where` or join-tree filters survive pruning.
 *
 * Missing or empty conditions prune the value, including nested groups and `pruneIfUndefined`.
 * Alias-only joins, HAVING, and implicit soft-delete/STI conditions do not keep the value alive.
 *
 * I.e. `queryMaybe({ from: b, where: b.authorId.eq(enabled ? a.id : undefined), select: b.id })`
 * returns `undefined` when `enabled` is false, so an enclosing `notExists` also prunes.
 */
export function queryMaybe<
  F extends QuerySource,
  const S extends QuerySelect = never,
  J extends QueryJoinInput = [],
  Name extends string = "?",
>(q: QueryArg<F, S, J, Name>): QueryValue<S, ResolvedJoins<F, J>, Name> | undefined {
  return createMaybeQueryValue(q) as QueryValue<S, ResolvedJoins<F, J>, Name> | undefined;
}

/** Applies queryMaybe's structural pruning before creating any kind of read-query value. */
function createMaybeQueryValue(q: AnyQuery): unknown | undefined {
  const normalized = normalizeQueryJoins(q);
  const where = normalizeWhere(normalized.where);
  checkCondition(where);
  return isPrunedQueryCondition(where) ? undefined : createQueryValue(normalized);
}

/**
 * Declares a `WITH RECURSIVE` CTE from its two terms, and returns the CTE as a readable value.
 *
 * `base` is the non-recursive term, which seeds the rows and, as in PostgreSQL, supplies the CTE's
 * columns. `step` is the recursive term: it receives the CTE itself, so it can join back to the rows
 * found so far. The two terms are combined with UNION ALL, or UNION when `union: "distinct"` drops
 * duplicates, which is how a cyclic graph is kept from looping forever.
 *
 * ```ts
 * const [a] = tables(Author);
 * const tree = recursiveQuery(
 *   "tree",
 *   { from: a, where: a.mentor_id.isNull(), select: { id: a.id, mentorId: a.mentor_id } },
 *   (self) => ({
 *     from: a,
 *     join: [{ inner: self, on: a.mentor_id.eq(self.id) }],
 *     select: { id: a.id, mentorId: a.mentor_id },
 *   }),
 * );
 * const rows = await em.query({ with: tree, from: tree, select: tree });
 * ```
 *
 * Unlike `query()`, the name is required, because the step term must name it.
 */
export function recursiveQuery<
  Name extends string,
  F extends QuerySource,
  const S extends QuerySelect,
  J extends QueryJoinInput,
>(
  name: Name,
  base: QueryArg<F, S, J, Name>,
  step: (self: Subquery<QueryRow<S, ResolvedJoins<F, J>>, Name>) => SetOperand,
  opts: RecursiveOptions = {},
): Subquery<QueryRow<S, ResolvedJoins<F, J>>, Name> {
  if (typeof name !== "string" || name === "") fail("A recursive CTE needs a name");
  if (opts.union !== undefined && opts.union !== "all" && opts.union !== "distinct") {
    fail("A recursive CTE's union must be 'all' or 'distinct'");
  }
  // Start on the base term so `self`'s columns resolve while the step term is still being built.
  const handle = new SubqueryHandle(toQuery(base), true);
  if (handle.output().kind !== "pojo") fail("A recursive CTE's base term needs a named projection");
  const self = newSubqueryProxy(handle) as Subquery<QueryRow<S, ResolvedJoins<F, J>>, Name>;
  const operands = [base, step(self)] as unknown as readonly SetOperand[];
  handle.setBody(opts.union === "distinct" ? { union: operands, as: name } : { unionAll: operands, as: name });
  return self;
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
 * sql.number`${b.order} * ${2}`
 *
 * // Reference an unmodeled column; prefer the table's own `column`, which keeps its source key.
 * a.column<string>("ts_search")
 * sql.condition`${a.column("ts_search")} @@ plainto_tsquery(${term})`
 * ```
 */
export function sql<R = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Expr<R, never> {
  return typedSql<R>(strings, ...values);
}

/** Shorthand for `sql<number>`; does not cast or convert the SQL result. */
sql.number = typedSql<number>;

/** Shorthand for `sql<number | null>`; does not cast or convert the SQL result. */
sql.numberOrNull = typedSql<number | null>;

/** Shorthand for `sql<number[]>`; does not cast or convert the SQL result. */
sql.numberArray = typedSql<number[]>;

/** Shorthand for `sql<number[] | null>`; does not cast or convert the SQL result. */
sql.numberArrayOrNull = typedSql<number[] | null>;

/** Shorthand for `sql<string>`; does not cast or convert the SQL result. */
sql.string = typedSql<string>;

/** Shorthand for `sql<string | null>`; does not cast or convert the SQL result. */
sql.stringOrNull = typedSql<string | null>;

/** Shorthand for `sql<string[]>`; does not cast or convert the SQL result. */
sql.stringArray = typedSql<string[]>;

/** Shorthand for `sql<string[] | null>`; does not cast or convert the SQL result. */
sql.stringArrayOrNull = typedSql<string[] | null>;

/** Shorthand for `sql<boolean>`; does not cast or convert the SQL result. */
sql.boolean = typedSql<boolean>;

/** Shorthand for `sql<boolean | null>`; does not cast or convert the SQL result. */
sql.booleanOrNull = typedSql<boolean | null>;

/** Shorthand for `sql<boolean[]>`; does not cast or convert the SQL result. */
sql.booleanArray = typedSql<boolean[]>;

/** Shorthand for `sql<boolean[] | null>`; does not cast or convert the SQL result. */
sql.booleanArrayOrNull = typedSql<boolean[] | null>;

/** A raw condition for `where`, `having`, or `on`. */
sql.condition = function condition(strings: TemplateStringsArray, ...values: unknown[]): SqlCondition {
  return deferredCondition((ctx) => new TemplateExpr(strings, values).toSql(ctx));
};

/**
 * Parses `arg` (a `Query` POJO or `query(...)` value) into a runnable `Plan`.
 *
 * `EntityManager.query` runs the plan; this module deliberately does not import `EntityManager` (see
 * `EntityHydrator`), so it parses and hands back `{ sql, bindings, decodeRows }` instead of executing.
 */
export function parseUserQuery(arg: unknown): Plan {
  if (arg instanceof SubqueryExpr) fail("Scalar query values are expressions, not executable read inputs");
  return parseQuery(toQuery(arg), undefined, new AliasAssigner());
}

/**
 * Parses a read that sits inside another statement, i.e. an INSERT's SELECT source, so it resolves that
 * statement's CTEs and shares its alias space instead of generating names that could collide with them.
 */
export function parseNestedQuery(arg: unknown, parent: Ctx, assigner: AliasAssigner): Plan {
  if (arg instanceof SubqueryExpr) fail("Scalar query values are expressions, not executable read inputs");
  return parseQuery(toQuery(arg), parent, assigner);
}

/** Recognizes read brands, including malformed hybrids that must reach read validation rather than mutation execution. */
export function isReadQueryValue(arg: unknown): boolean {
  return isSubqueryValue(arg) || isEntityQueryValue(arg);
}

/**
 * Compiles scalar or nonempty named expression projections, shared by SELECT and mutation RETURNING.
 * Source-shaped values need read hydration/source rules and are deliberately excluded here.
 */
export function projectionToSql(
  select: unknown,
  ctx: Ctx,
  joins?: QueryJoinList,
): { selects: SqlFragment[]; decodeRows: Plan["decodeRows"]; output: QueryOutput } {
  const output = joinedOutput(projectionOutput(select), joins);
  if (output.kind === "scalar") {
    // Scalar mode: one value per row, used by scalar/IN-list subqueries
    const expr = output.columns[0][1];
    const fragment = expr.toSql(ctx);
    const selects = [{ ...fragment, sql: `${fragment.sql} AS value` }];
    return {
      selects,
      decodeRows: (_, rows) => rows.map((row) => decodeValue(expr, row.value)),
      output,
    };
  }
  // POJO mode
  const entries = output.columns;
  const selects = entries.map((entry) => {
    const [key, expr] = entry;
    const fragment = expr.toSql(ctx);
    return { ...fragment, sql: `${fragment.sql} AS ${safeKq(key)}` };
  });
  return {
    selects,
    decodeRows: (_, rows) => rows.map((row) => decodeRow(row, entries)),
    output,
  };
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
  /** Expressions retain codecs and physical nullability after LEFT joins and set operations. */
  columns: readonly (readonly [string, BaseExpr])[];
}

/** The runtime identity of a `query(...)` value; `Ctx.aliasFor` keys on it, like a table's `TableMgmt`. */
export class SubqueryHandle {
  #q: AnyReadQuery;

  constructor(
    q: AnyReadQuery,
    readonly recursive = false,
  ) {
    this.#q = q;
  }

  get q(): AnyReadQuery {
    return this.#q;
  }

  /**
   * Gives a recursive CTE its finished body. `recursiveQuery` starts the handle on its base term, so
   * the step term can read the CTE's columns while the body that will hold that step is still being
   * built. The base term supplies the CTE's columns either way, PostgreSQL's rule for a recursive WITH.
   */
  setBody(q: AnyReadQuery): void {
    if (!this.recursive) fail("Only a recursive CTE replaces its body");
    this.#q = q;
  }

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

  get [selectKeyBrand](): string {
    return this.key;
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

  get outputType(): TypeInfo | undefined {
    return this.inner.outputType;
  }

  get sqlNullable(): boolean | undefined {
    return this.inner.sqlNullable;
  }

  get sqlSource(): object {
    return this.handle;
  }
}

/**
 * A scalar (or IN-list) subquery, i.e. `query({ from: b, where: [...], select: b.id.count() })`.
 *
 * It closes over the outer aliases it references, so correlation is free; those references are the
 * subquery's "free" aliases and count toward the outer query's join pruning.
 */
class SubqueryExpr extends BaseExpr {
  readonly [scalarQueryBrand] = true;

  constructor(readonly handle: SubqueryHandle) {
    super();
  }

  get subquerySelect(): BaseExpr {
    const expr = this.handle.output().columns[0][1];
    // Polymorphic IN uses the original alias's ID metadata when its key codec is unknown.
    return expr instanceof OutputExpr ? expr.inner : expr;
  }

  get outputType(): TypeInfo | undefined {
    return this.subquerySelect.outputType;
  }

  get sqlNullable(): boolean {
    // Even a NOT NULL projection becomes NULL when a scalar subquery returns no rows.
    return true;
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

function isPlainSelect(select: unknown): select is Record<string, SelectExpression> {
  return (
    typeof select === "object" &&
    select !== null &&
    !isExpr(select) &&
    !isSubqueryValue(select) &&
    !isEntityQueryValue(select) &&
    (Object.getPrototypeOf(select) === Object.prototype || Object.getPrototypeOf(select) === null)
  );
}

/** Returns the runtime identity of a source: a table's `TableMgmt` or a subquery's handle. */
function handleOf(source: unknown): TableSourceMgmt | SubqueryHandle {
  if (isTable(source)) return getTableMgmt(source);
  if (isSubqueryValue(source)) return readValueHandle(source);
  return fail(`Expected a table or a query(...) value, got ${source}`);
}

// =====================================================================================================
// Runtime: parse -> prune -> SQL -> decode
// =====================================================================================================

function toQuery(arg: unknown): AnyReadQuery {
  if (isReadQueryValue(arg)) return toQuery(readValueHandle(arg).q);
  if (arg instanceof SubqueryExpr) return toQuery(arg.handle.q);
  validateReadQuery(arg);
  return arg;
}

/** Virtual subquery columns are not own clauses; attached properties on the value are always rejected. */
function readValueHandle(arg: unknown): SubqueryHandle {
  if (!isSubqueryValue(arg) && !isEntityQueryValue(arg)) return fail("Expected a branded read query value");
  const brand = isSubqueryValue(arg) ? subqueryBrand : entityQueryBrand;
  validateQueryKeys(arg, [brand], "Read query values");
  const handle = isSubqueryValue(arg) ? arg[subqueryBrand] : arg[entityQueryBrand];
  return handle instanceof SubqueryHandle ? handle : fail("Invalid read query value handle");
}

const SET_OPERATIONS: Record<SetOperation, string> = {
  union: "UNION",
  unionAll: "UNION ALL",
  intersect: "INTERSECT",
  intersectAll: "INTERSECT ALL",
  except: "EXCEPT",
  exceptAll: "EXCEPT ALL",
};

const MUTATION_KEYS: readonly MutationKey[] = ["insert", "update", "delete", "values", "set", "returning", "allowAll"];

const READ_KEYS: readonly (keyof Clauses | "from" | "as")[] = [
  "with",
  "from",
  "join",
  "where",
  "groupBy",
  "having",
  "select",
  "orderBy",
  "limit",
  "offset",
  "distinct",
  "pruneJoins",
  "softDeletes",
  "as",
];

/**
 * Checks every ordinary or compound root before exposing output metadata or compiling SQL.
 * Validate options before applying defaults so wrong-type values, including null, cannot disappear.
 */
function validateReadQuery(arg: unknown): asserts arg is AnyReadQuery {
  if (typeof arg !== "object" || arg === null || Array.isArray(arg)) {
    fail("em.query expects a { from, select, ... } object or a query(...) value");
  }
  if (isSetQuery(arg)) {
    setOperands(arg);
  } else {
    validateQueryKeys(arg, READ_KEYS, "Read queries");
    if (!("from" in arg && "select" in arg))
      fail("em.query expects a { from, select, ... } object or a query(...) value");
  }
  const options = arg as Record<string, unknown>;
  for (const key of ["limit", "offset"]) {
    const value = options[key];
    if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
      fail(`Read query ${key} must be a nonnegative finite integer`);
    }
  }
  if (options.softDeletes !== undefined && options.softDeletes !== "include" && options.softDeletes !== "exclude") {
    fail("Read query softDeletes must be 'include' or 'exclude'");
  }
  for (const key of ["distinct", "pruneJoins"]) {
    if (options[key] !== undefined && typeof options[key] !== "boolean") fail(`Read query ${key} must be a boolean`);
  }
  if (options.as !== undefined && typeof options.as !== "string") fail("Read query as must be a string");
}

/** Includes undefined, symbol, non-enumerable, and inherited clauses rather than silently ignoring them. */
function validateQueryKeys(arg: object, allowed: readonly PropertyKey[], description: string): void {
  for (let object: object | null = arg; object && object !== Object.prototype; object = Object.getPrototypeOf(object)) {
    for (const key of Reflect.ownKeys(object)) {
      if (allowed.includes(key)) continue;
      if (MUTATION_KEYS.includes(key as MutationKey)) {
        fail(`Read queries do not support mutation clause '${String(key)}'; use em.execute`);
      }
      fail(`${description} do not support clause '${String(key)}'`);
    }
  }
}

/** Detect operation keys even when their values are invalid, so mixed roots cannot fall through to SELECT. */
function isSetQuery(value: unknown): value is SetQuery<readonly SetOperand[]> {
  return typeof value === "object" && value !== null && Object.keys(SET_OPERATIONS).some((key) => key in value);
}

/** Validate each root independently; no operand, including the left side of EXCEPT, can be pruned. */
function setOperands(q: SetQuery<readonly SetOperand[]>): [SetOperation, readonly SetOperand[]] {
  const keys = (Object.keys(SET_OPERATIONS) as SetOperation[]).filter((key) => key in q);
  if (keys.length !== 1) fail("A set query requires exactly one operation key");
  validateQueryKeys(q, [keys[0], "with", "orderBy", "limit", "offset", "as"], "Set queries");
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
 * UNION admits NULL from any branch; EXCEPT/INTERSECT retain the left branch's nullable facts.
 * Unknown nullability stays unknown unless another UNION branch is known nullable.
 */
function queryOutput(q: AnyReadQuery): QueryOutput {
  validateReadQuery(q);
  if (isSetQuery(q)) {
    const [operation, operands] = setOperands(q);
    const first = queryOutput(toQuery(operands[0]));
    const columns = [...first.columns];
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
      for (let i = 0; i < columns.length; i++) {
        const [key, expr] = columns[i];
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
        if (operation === "union" || operation === "unionAll") {
          const nullable =
            expr.sqlNullable === true || other.sqlNullable === true
              ? true
              : expr.sqlNullable === undefined || other.sqlNullable === undefined
                ? undefined
                : false;
          if (nullable !== expr.sqlNullable) columns[i] = [key, new OutputExpr(expr, nullable)];
        }
      }
    }
    setOrderBys(q, first);
    return { kind: first.kind, columns };
  }
  q = normalizeQueryJoins(q);
  const { select } = q;
  if (isTable(select)) return { kind: "entity", columns: [] };
  if (isSubqueryValue(select)) return readValueHandle(select).output();
  return joinedOutput(projectionOutput(select), q.join);
}

/** Validates the projection before compiling SQL or exposing reusable query columns. */
function projectionOutput(select: unknown): QueryOutput {
  if (isExpr(select)) return { kind: "scalar", columns: [["value", asExpr(select, "select")]] };
  if (Array.isArray(select)) {
    if (select.length === 0) fail("A column array projection must not be empty");
    const columns: [string, BaseExpr][] = select.map((value, index) => {
      const expr = asExpr(value, `select[${index}]`);
      const key = (expr as BaseExpr & { readonly [selectKeyBrand]?: unknown })[selectKeyBrand];
      if (typeof key !== "string") fail(`select[${index}] must be a physical or subquery column`);
      return [key, expr];
    });
    const keys = new Set(columns.map(([key]) => key));
    if (keys.size !== columns.length) fail("A column array projection must not contain duplicate field names");
    return { kind: "pojo", columns };
  }
  if (isPlainSelect(select)) {
    const columns: [string, BaseExpr][] = [];
    // Enumerate once: a projection proxy must not be revisited just to check for symbol keys.
    for (const key of Reflect.ownKeys(select)) {
      if (typeof key !== "string") fail("Projection keys must be strings");
      if (Object.prototype.propertyIsEnumerable.call(select, key))
        columns.push([key, asSelectExpr(select[key], `select.${key}`)]);
    }
    if (columns.length === 0) fail("A named expression projection must not be empty");
    return { kind: "pojo", columns };
  }
  return fail("Expected a scalar expression or a nonempty named expression projection");
}

/**
 * Adds SQL nullability from unmatched LEFT joins without mutating shared expressions or their codecs.
 * Only direct columns carry sqlSource; COUNT and COALESCE retain their own SQL nullability.
 * I.e. selecting Book.title from a LEFT-joined Book makes its output nullable, but COUNT(Book.id) stays NOT NULL.
 */
function joinedOutput(output: QueryOutput, joins: QueryJoinList | undefined): QueryOutput {
  if (!joins?.some((join) => join?.left)) return output;
  const left = new Set<object>();
  for (const join of resolveReferenceJoins(joins)) if (join.left) left.add(handleOf(join.left));
  return {
    kind: output.kind,
    columns: output.columns.map((column) => {
      const [key, expr] = column;
      return expr.sqlSource && left.has(expr.sqlSource) && expr.sqlNullable !== true
        ? [key, new OutputExpr(expr, true)]
        : column;
    }),
  };
}

/**
 * Resolves reference joins in declaration order without changing reusable join entries.
 * Only .as() carries a source handle; explicit INNER joins retain their filtering semantics.
 * I.e. LEFT Book followed by Book.author.as(a) adds Author to the set of nullable handles.
 */
function resolveReferenceJoins(joins: QueryJoinList | undefined): QueryJoin[] {
  const left = new Set<object>();
  return (joins ?? []).filter(isDefined).map((join) => {
    const source = (join as QueryJoin & { [referenceJoinSource]?: object })[referenceJoinSource];
    if (join.inner && source && left.has(source)) {
      const { inner, ...rest } = join;
      const resolved = { ...rest, left: inner };
      left.add(handleOf(inner));
      return resolved;
    }
    if (join.left) left.add(handleOf(join.left));
    return join;
  });
}

/** An output-only nullability adjustment that preserves the selected expression's SQL and conversions. */
class OutputExpr extends BaseExpr {
  constructor(
    readonly inner: BaseExpr,
    private nullable: boolean | undefined,
  ) {
    super();
  }

  get outputType(): TypeInfo | undefined {
    return this.inner.outputType;
  }

  get sqlNullable(): boolean | undefined {
    return this.nullable;
  }

  toSql(ctx: ExprContext): SqlFragment {
    return this.inner.toSql(ctx);
  }

  decode(value: unknown): unknown {
    return this.inner.decode(value);
  }

  encode(value: unknown): unknown {
    return this.inner.encode(value);
  }
}

/**
 * Compile siblings in separate local scopes with the same enclosing context. Projection wrappers align
 * output positions without moving DISTINCT/order/pagination or repeating volatile selected expressions.
 * Parenthesizing each accumulated left side preserves array association and explicit nested grouping.
 */
function parseSetQuery(
  q: SetQuery<readonly SetOperand[]>,
  parent: Ctx | undefined,
  assigner: AliasAssigner,
  recursiveSelf?: SubqueryHandle,
): Plan {
  const [operation, operands] = setOperands(q);
  const output = queryOutput(q);
  // A set query's CTEs need a scope of their own, between the enclosing query and the operands.
  const ctx = new Ctx(assigner, parent);
  if (recursiveSelf) ctx.setRecursiveSelf(recursiveSelf);
  const ctes = registerCtes(q, ctx, assigner);
  const plans = operands.map((operand) => parseQuery(toQuery(operand), ctx, assigner));
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
  const keptCtes = pruneCtes(ctes, new Set(plans.flatMap((plan) => plan.outerRefs)));
  if (keptCtes.length > 0) {
    const clause = withFragment(keptCtes);
    sql = clause.sql + sql;
    bindings.unshift(...clause.bindings);
  }
  // An operand that reads one of our CTEs resolved that name here, not in the enclosing query, so the
  // name must not go out in `outerRefs`. That list is how this query tells the enclosing one which of
  // *its* aliases we depend on, and the enclosing query keeps those joins alive rather than pruning
  // them; a CTE name in there would pin a join that has nothing to do with it.
  const cteAliases = new Set(ctes.map((cte) => cte.alias));
  const outerRefs = [...ctx.outerRefs, ...plans.flatMap((plan) => plan.outerRefs)];
  return {
    sql,
    bindings,
    outerRefs: [...new Set(outerRefs.filter((ref) => !cteAliases.has(ref)))],
    output,
    decodeRows: (_, rows) => rows.map((row) => decodeRow(row, output.columns)),
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
export class Ctx implements ExprContext {
  private aliases = new Map<object, string>();
  /**
   * The subset of `aliases` that are CTE names. A `from`/`join` on one of these emits just the name,
   * i.e. `FROM book_stats`, where an ordinary `query(...)` value emits its whole body inline, i.e.
   * `FROM (SELECT ...) AS sq`.
   */
  private ctes = new Map<object, string>();
  /**
   * `with` entries named but not yet turned into SQL. `registerCtes` names every entry first, then
   * generates the bodies one at a time, so while one body is being generated the entries after it sit
   * here. Reading one of those is a forward reference.
   */
  private pendingCtes = new Map<object, string>();
  /** CTEs already read by this query's `from`/`join`, so a second read fails instead of colliding. */
  private usedCtes = new Set<object>();
  /** The recursive CTE whose body this query is part of, if any; see `recursiveSelf`. */
  private ownRecursiveSelf: SubqueryHandle | undefined;
  readonly outerRefs = new Set<string>();

  constructor(
    readonly assigner: AliasAssigner,
    private parent: Ctx | undefined,
  ) {}

  /**
   * One handle can hold only one alias per query, so a value used twice must be told apart, not
   * silently collapsed into the second registration's alias.
   */
  register(handle: object, alias: string): void {
    if (this.aliases.has(handle)) {
      fail(
        `${describeHandle(handle)} is already in this query's \`with\`/\`from\`/\`join\`; use a separate table(...)/query(...) value for each use`,
      );
    }
    this.aliases.set(handle, alias);
  }

  /** Names every `with` entry up front, so a CTE reading a later sibling is reported, not inlined. */
  declareCte(handle: object, alias: string): void {
    this.pendingCtes.set(handle, alias);
  }

  /** Brings a pending CTE into scope, for the sources and columns that may now read it. */
  promoteCte(handle: object): void {
    const alias = this.pendingCtes.get(handle) ?? fail("CTE was not declared");
    this.pendingCtes.delete(handle);
    this.ctes.set(handle, alias);
    this.register(handle, alias);
  }

  /**
   * The CTE name for `handle`, looking in the enclosing queries too, because a CTE is in scope for the
   * whole statement.
   *
   * Unlike `aliasFor`, a hit in an enclosing query is not added to `outerRefs`: reading a CTE by name
   * is not a correlated reference, so it must not keep an enclosing join alive.
   */
  cteAliasFor(handle: object): string | undefined {
    return this.ctes.get(handle) ?? this.parent?.cteAliasFor(handle);
  }

  /**
   * The recursive CTE this query's terms belong to, inherited from the enclosing query.
   *
   * PostgreSQL requires a recursive term to reference its own CTE, so that reference is not optional
   * and must survive pruning, unlike an ordinary explicit join that nothing else reads.
   */
  get recursiveSelf(): SubqueryHandle | undefined {
    return this.ownRecursiveSelf ?? this.parent?.recursiveSelf;
  }

  setRecursiveSelf(handle: SubqueryHandle): void {
    this.ownRecursiveSelf = handle;
  }

  /** Whether `handle` is a CTE with no SQL yet, i.e. itself or a later `with` entry. */
  isPendingCte(handle: object): boolean {
    return this.pendingCtes.has(handle) || (this.parent?.isPendingCte(handle) ?? false);
  }

  /**
   * Fails if this query already reads `handle`. A `Ctx` maps each handle to a single alias, so two
   * reads of one CTE value would render as the same name, i.e. `FROM tree JOIN tree`, and neither the
   * SQL nor a column expression could say which one it meant. Each read needs its own `query(...)`.
   *
   * Only this query is checked, not the enclosing ones: a nested subquery has its own FROM, so reading
   * the same CTE in there is fine.
   */
  useCte(handle: object): void {
    if (this.usedCtes.has(handle)) {
      fail(
        `${describeHandle(handle)} is already in this query's \`from\`/\`join\`; use a separate query(...) value for each use`,
      );
    }
    this.usedCtes.add(handle);
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

  conditionToSql(cond: QueryCondition): SqlFragment | undefined {
    // Inside another expression (i.e. a `sql` template), keep `a OR b` grouped
    return conditionToSql(cond, this, false);
  }
}

function describeHandle(handle: object): string {
  if (handle instanceof SubqueryHandle) return `Subquery ${handle.describe()}`;
  if (handle instanceof JoinTableHandle) return `Join table ${handle.joinTableName}`;
  if ("tableName" in handle) return `Table for ${(handle as TableSourceMgmt).tableName}`;
  return "Table";
}

interface ParsedSource {
  handle: TableSourceMgmt | SubqueryHandle | JoinTableHandle;
  alias: string;
  /** `table AS alias` or `(SELECT ...) AS alias`. */
  sql: string;
  bindings: any[];
  /** Outer aliases a derived table references; PG rejects those without LATERAL, but pruning should still see them. */
  refs: string[];
  /** Entity-mode selects, i.e. `a.*` excluding lazy columns. */
  entitySelects: string[];
  meta: EntityMetadata | undefined;
}

/** A parsed `with` entry: the CTE's name and its body, ready to render into the WITH clause. */
export interface ParsedCte {
  alias: string;
  plan: Plan;
  /** A recursive CTE reads itself, and makes the whole clause `WITH RECURSIVE`. */
  recursive: boolean;
}

interface ParsedJoin {
  kind: "inner" | "left";
  source: ParsedSource;
  /** The user's ON alone; `undefined` means it pruned away entirely, an error if the join is kept. */
  userOn: SqlFragment | undefined;
  /** The ON to emit: the user's ON plus any injected soft-delete conditions. */
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
function parseQuery(
  q: AnyReadQuery,
  parent: Ctx | undefined,
  assigner: AliasAssigner,
  recursiveSelf?: SubqueryHandle,
): Plan {
  validateReadQuery(q);
  if (isSetQuery(q)) return parseSetQuery(q, parent, assigner, recursiveSelf);
  q = normalizeQueryJoins(q);
  const ctx = new Ctx(assigner, parent);
  if (recursiveSelf) ctx.setRecursiveSelf(recursiveSelf);
  const joinEntries = resolveReferenceJoins(q.join);

  // 0. Compile CTEs first: they are in scope for every source below, and cannot read those sources.
  const ctes = registerCtes(q, ctx, assigner);

  // 1. Register every source before generating SQL, so conditions can resolve their aliases.
  const parseFrom = registerSource(q.from, ctx, assigner);
  const pendingJoins = joinEntries.flatMap((j) => {
    const kind = "inner" in j && j.inner ? ("inner" as const) : ("left" as const);
    const alias = kind === "inner" ? j.inner : j.left;
    const keep = j.keep ?? false;
    // Only collection sugar joins (o2m/m2m) filter soft-deletes, em.find's relation semantics:
    // references (m2o/o2o/poly) resolve soft-deleted entities, and explicit joins are the user's own
    const softDeletes = (j as any)[collectionJoin] === true;
    const target = { kind, keep, on: j.on, softDeletes, parseSource: registerSource(alias, ctx, assigner) };
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
  const userJoins: ParsedJoin[] = pendingJoins.map((j) => {
    const source = j.parseSource();
    // `userOn` is the user's ON alone, so the collapsed-ON check below is not fooled by injections
    const userOn = conditionToSql(j.on, ctx, true);
    const injected = injectedConditions(source, j.softDeletes ? softDeletes : "include");
    const fullOn = userOn && injected.length > 0 ? conditionToSql({ and: [j.on, ...injected] }, ctx, true) : userOn;
    return { kind: j.kind, keep: j.keep, source, userOn, fullOn };
  });
  const cti = ctiEntityPlan(q, from, assigner);
  const joins = [...cti.joins, ...userJoins];
  const sti = stiEntityPlan(q, from);
  const { selects, decodeRows, output } = selectsToSql(q, ctx, from, cti.selects ?? sti.selects);
  const fromInjected = [...injectedConditions(from, softDeletes), ...sti.conditions];
  const predicate = normalizeWhere(q.where);
  const where = conditionToSql(fromInjected.length > 0 ? { and: [predicate, ...fromInjected] } : predicate, ctx, true);
  const having = conditionToSql(q.having, ctx, true);
  const groupBys = (q.groupBy ?? []).map((g) => asExpr(g, "groupBy").toSql(ctx));
  const orderBys = orderBysToSql(q, ctx);

  // 3. Prune.
  const { joins: kept, ctes: keptCtes } = pruneJoins(
    q,
    ctx,
    from,
    joins,
    ctes,
    [...selects, ...groupBys, ...orderBys, where, having].filter(isDefined),
  );
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
  // WITH leads the statement, so its bindings must be pushed before the SELECT's.
  if (keptCtes.length > 0) out.push(withFragment(keptCtes));
  out.push({ sql: `SELECT ${q.distinct ? "DISTINCT " : ""}`, bindings: [], refs: [] });
  out.push(joinFragmentParts(selects, ", "));
  out.push({ sql: ` FROM ${from.sql}`, bindings: from.bindings, refs: [] });
  for (const j of kept) {
    const keyword = j.kind === "inner" ? "JOIN" : "LEFT OUTER JOIN";
    out.push({
      sql: ` ${keyword} ${j.source.sql} ON ${j.fullOn!.sql}`,
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
 * Conditions resolve source identities through the context when their SQL is generated.
 * Each entity source reads only its physical table, without inheritance joins or class tags.
 */
function registerSource(source: unknown, ctx: Ctx, assigner: AliasAssigner): () => ParsedSource {
  const handle = handleOf(source);
  const cteAlias = ctx.cteAliasFor(handle);
  if (cteAlias) {
    ctx.useCte(handle);
    // A declared CTE is read by its name; the `with` that declared it already parsed its body.
    return () => ({
      handle,
      alias: cteAlias,
      sql: safeKq(cteAlias),
      bindings: [],
      refs: [],
      entitySelects: [],
      meta: undefined,
    });
  }
  if (ctx.isPendingCte(handle)) {
    fail(
      `${describeHandle(handle)} is declared later in this query's \`with\`; a CTE can only read earlier ones, and cannot read itself`,
    );
  }
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
        entitySelects: [],
        meta: undefined,
      };
    };
  } else {
    const mgmt = getTableMgmt(source as any);
    const { tableName } = mgmt;
    const meta = "meta" in mgmt ? mgmt.meta : undefined;
    const alias = assigner.getAlias(tableName);
    ctx.register(handle, alias);
    return () => {
      // Ordinary entity mode selects the table's columns, excluding lazy ones like em.find.
      const entitySelects = !meta ? [] : meta.hasLazyColumns ? lazyExcludedSelects(meta, alias) : [kqStar(alias)];
      return {
        handle,
        alias,
        sql: `${kq(tableName)} AS ${kq(alias)}`,
        bindings: [],
        refs: [],
        entitySelects,
        meta,
      };
    };
  }
}

/**
 * Per-source soft-delete injections: `alias.deleted_at IS NULL` for a soft-deletable entity.
 * CTI subtypes are skipped because their deleted-at column belongs to the base table (see
 * `filterSoftDeletes`). STI sources read all physical rows without discriminator predicates.
 *
 * The conditions go into the from's WHERE or the join's ON, and never keep an otherwise unreferenced
 * join alive, which is what `pruneable: true` means on em.find's side.
 */
export function injectedConditions(
  source: { meta: EntityMetadata | undefined; alias: string },
  softDeletes: "include" | "exclude",
): ColumnCondition[] {
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
    entitySelects: [],
    meta: undefined,
  });
}

/** Generates the `select` clause SQL and returns how to decode the resulting rows. */
function selectsToSql(
  q: AnyQuery,
  ctx: Ctx,
  from: ParsedSource,
  entitySelects?: SqlFragment[],
): { selects: SqlFragment[]; decodeRows: Plan["decodeRows"]; output: QueryOutput } {
  const { select } = q;
  if (isTable(select) && !isEntityTable(select)) {
    fail("A custom table cannot be selected as an entity; select its columns individually");
  }
  if (isEntityTable(select)) {
    // Ordinary entity mode: `a.*`, hydrated through the identity map. Only the from is
    // hydratable: a joined alias would need null-row skipping and left-join nullability (see TODO.md)
    if (from.handle !== getTableMgmt(select)) {
      fail("Selecting a joined table is not supported yet; select the from table, or select its columns individually");
    }
    const alias = ctx.aliasFor(getTableMgmt(select));
    const meta = getTableMetadata(select);
    const selects = entitySelects ?? from.entitySelects.map((s) => ({ sql: s, bindings: [], refs: [alias] }));
    return {
      selects,
      decodeRows: (em, rows) => em.hydrate(meta.cstr as any, rows),
      output: { kind: "entity", columns: [] },
    };
  } else if (isSubqueryValue(select)) {
    // `select: <subquery>` is `select *` for that table; like entity mode, only for the from, since a
    // left-joined subquery's unmatched rows would decode null fields the row type calls non-null
    const handle = readValueHandle(select);
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
  }
  return projectionToSql(select, ctx, q.join);
}

/**
 * Builds the mandatory CTI joins and flat row projection needed by entity hydration.
 *
 * The joins use the same ParsedJoin path as user joins, but `keep: true` makes them survive pruning.
 * They are generated only for an entity selection of the from source; POJO and scalar reads keep their
 * physical-table behavior. User source aliases have already been allocated, so the preferred `_bN` and
 * `_sN` aliases can be made unique before their projection fragments are built.
 */
function ctiEntityPlan(
  q: AnyQuery,
  from: ParsedSource,
  assigner: AliasAssigner,
): { joins: ParsedJoin[]; selects: SqlFragment[] | undefined } {
  // CTI expansion belongs only to entity mode. Column projections keep their explicit physical-table shape.
  if (!isEntityTable(q.select) || from.handle !== getTableMgmt(q.select)) return { joins: [], selects: undefined };
  const meta = getTableMetadata(q.select);
  if (meta.inheritanceType !== "cti") return { joins: [], selects: undefined };

  // Start with the selected table. Hydration expects one flat row containing every CTI table's columns.
  const joins: ParsedJoin[] = [];
  const selects: SqlFragment[] = from.entitySelects.map((sql) => ({ sql, bindings: [], refs: [from.alias] }));

  // A subtype starts from its own table, so join each base table to recover inherited fields.
  for (const [i, baseMeta] of meta.baseTypes.entries()) {
    const alias = assigner.getLiteralAlias(`${from.alias}_b${i}`);
    joins.push(ctiJoin(from, baseMeta, alias));
    selects.push(...entitySelectFragments(baseMeta, alias));
  }

  // A base type needs every subtype table both for subtype fields and for detecting the concrete class.
  // Record each subtype column's aliases while visiting them because sibling tables can reuse a column name.
  const subtypeColumns = new Map<string, string[]>();
  for (const [i, subtypeMeta] of meta.subTypes.entries()) {
    const alias = assigner.getLiteralAlias(`${from.alias}_s${i}`);
    joins.push(ctiJoin(from, subtypeMeta, alias));
    selects.push(...entitySelectFragments(subtypeMeta, alias));
    for (const field of Object.values(subtypeMeta.fields)) {
      if (field.fieldName === "id" || !field.serde || (field.kind === "primitive" && field.lazy)) continue;
      for (const column of field.serde.columns) {
        const aliases = subtypeColumns.get(column.columnName);
        if (aliases) aliases.push(alias);
        else subtypeColumns.set(column.columnName, [alias]);
      }
    }
  }

  // Joined `table.*` projections can overwrite id, so finish with the selected table's canonical entity id.
  selects.push({
    sql: `${safeKq(from.alias)}.${kq("id")} AS ${kq("id")}`,
    bindings: [],
    refs: [from.alias],
  });
  // Collapse same-named sibling fields into the one column name that entity hydration reads.
  for (const [column, aliases] of subtypeColumns) {
    if (aliases.length < 2) continue;
    selects.push({
      sql: `COALESCE(${aliases.map((alias) => `${safeKq(alias)}.${kq(column)}`).join(", ")}) AS ${kq(column)}`,
      bindings: [],
      refs: aliases,
    });
  }
  // The first present subtype row identifies the concrete constructor; `_` means the base table itself.
  if (meta.subTypes.length > 0) {
    const subtypeAliases = joins.slice(meta.baseTypes.length).map((join) => join.source.alias);
    selects.push({
      sql: `CASE ${subtypeAliases.map((alias) => `WHEN ${safeKq(alias)}.${kq("id")} IS NOT NULL THEN ?`).join(" ")} ELSE '_' END AS ${kq("__class")}`,
      bindings: meta.subTypes.map((subtype) => subtype.type),
      refs: subtypeAliases,
    });
  }
  return { joins, selects };
}

/** Adds the discriminator projection and subtype filter required by STI entity hydration. */
function stiEntityPlan(
  q: AnyQuery,
  from: ParsedSource,
): { selects: SqlFragment[] | undefined; conditions: ColumnCondition[] } {
  // As with CTI, only a table selected from itself requests entity hydration and inheritance behavior.
  if (!isEntityTable(q.select) || from.handle !== getTableMgmt(q.select)) return { selects: undefined, conditions: [] };
  const meta = getTableMetadata(q.select);
  if (meta.inheritanceType !== "sti") return { selects: undefined, conditions: [] };

  // STI stores the complete family in one row, so the ordinary physical projection already supplies its fields.
  const selects: SqlFragment[] = from.entitySelects.map((sql) => ({ sql, bindings: [], refs: [from.alias] }));
  // `table.*` includes the discriminator. An explicit lazy-safe projection might not, so append it for hydration.
  if (!(from.entitySelects.length === 1 && from.entitySelects[0] === kqStar(from.alias))) {
    const discriminator = getBaseMeta(meta).stiDiscriminatorColumnName!;
    selects.push({
      sql: `${safeKq(from.alias)}.${kq(discriminator)} AS ${kq(discriminator)}`,
      bindings: [],
      refs: [from.alias],
    });
  }
  // Root reads may hydrate any concrete class. Subtype reads must exclude sibling rows to preserve their result type.
  const condition = stiSubtypeFilter(meta, from.alias);
  return { selects, conditions: condition ? [condition] : [] };
}

/** Creates one mandatory CTI join through the selected source's primary key. */
function ctiJoin(from: ParsedSource, meta: EntityMetadata, alias: string): ParsedJoin {
  const on = {
    sql: `${safeKq(from.alias)}.${kq("id")} = ${safeKq(alias)}.${kq("id")}`,
    bindings: [],
    refs: [from.alias, alias],
  };
  return {
    kind: "left",
    source: {
      handle: { tableName: meta.tableName, meta } as TableMgmt,
      alias,
      sql: `${kq(meta.tableName)} AS ${safeKq(alias)}`,
      bindings: [],
      refs: [],
      entitySelects: [],
      meta,
    },
    userOn: on,
    fullOn: on,
    keep: true,
  };
}

/** Selects one physical CTI table while preserving lazy-field exclusions. */
function entitySelectFragments(meta: EntityMetadata, alias: string): SqlFragment[] {
  const selects = meta.hasLazyColumns ? lazyExcludedSelects(meta, alias) : [kqStar(alias)];
  return selects.map((sql) => ({ sql, bindings: [], refs: [alias] }));
}

function decodeRow(row: any, decoders: readonly (readonly [string, BaseExpr])[]): any {
  const result: any = {};
  for (const [key, expr] of decoders) {
    const value = row[key];
    const decoded = decodeValue(expr, value);
    // A projected __proto__ is data, not a request to replace the result object's prototype.
    if (key === "__proto__") {
      Object.defineProperty(result, key, { value: decoded, enumerable: true, configurable: true, writable: true });
    } else {
      result[key] = decoded;
    }
  }
  return result;
}

/** Decodes a top-level projected SQL NULL using Joist's undefined convention. */
function decodeValue(expr: BaseExpr, value: unknown): unknown {
  return value === null ? undefined : expr.decode(value);
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
 * directions are omitted before expression references are collected.
 */
function orderBysToSql(q: AnyQuery, ctx: Ctx): SqlFragment[] {
  const { orderBy, select } = q;
  if (!orderBy) return [];
  const result: SqlFragment[] = [];
  for (const entry of Array.isArray(orderBy) ? orderBy : [orderBy]) {
    if (entry === undefined) continue;
    // A select key can also be named sort, order, or nulls, so distinguish by the sort value.
    if (isExpr(entry.sort)) {
      const fragment = orderByToSql(entry, ctx);
      if (fragment) result.push(fragment);
      continue;
    }
    for (const [key, dir] of Object.entries(entry)) {
      if (dir === undefined) continue;
      // The direction is interpolated into the SQL, so never trust it, i.e. it might be a request param
      if (!ORDER_BY_DIRECTIONS.includes(dir as string)) return fail(`Invalid orderBy direction '${dir}'`);
      // Entity mode orders by the alias's column; POJO/subquery selects order by the output column name
      if (isTable(select)) {
        const column = (select as any)[key];
        if (!isExpr(column)) return fail(`orderBy key '${key}' is not a sortable column of the table`);
        const fragment = asNode(column).toSql(ctx);
        result.push({ ...fragment, sql: `${fragment.sql} ${dir}` });
      } else {
        if (isExpr(select)) return fail(`the keyed orderBy form needs a POJO or entity select`);
        const keys = isSubqueryValue(select)
          ? select[subqueryBrand].columnKeys()
          : projectionOutput(select).columns.map(([key]) => key);
        if (!keys.includes(key)) return fail(`orderBy key '${key}' is not a key of select`);
        result.push({ sql: `${safeKq(key)} ${dir}`, bindings: [], refs: [] });
      }
    }
  }
  return result;
}

/**
 * Parses a user-facing condition (a single condition or an `{ and }`/`{ or }` filter) with the same
 * `ConditionBuilder` `em.find` uses, so `undefined` members drop out, empty groups drop, and
 * `pruneIfUndefined` applies unchanged. Deferred SQL expression conditions are resolved
 * against the context first.
 */
export function conditionToSql(cond: QueryCondition | undefined, ctx: Ctx, topLevel: boolean): SqlFragment | undefined {
  checkCondition(cond);
  if (cond === undefined) return undefined;
  const resolved = resolveDeferredConditions(resolveQueryCondition(cond, ctx), ctx);
  if (resolved === undefined) return undefined;
  const filter: ConditionGroup<ConditionInput> = isFilter(resolved) ? resolved : { and: [resolved] };
  const cb = new ConditionBuilder();
  cb.maybeAddExpression(filter);
  const parsed = cb.toExpressionFilter();
  if (!parsed) return undefined;
  const where = buildWhereClause(parsed, topLevel);
  if (!where) return undefined;
  return { sql: where[0], bindings: where[1], refs: refsOf(parsed) };
}

/**
 * Rejects malformed predicates throughout a condition tree before pruning can discard a restriction.
 * I.e. an invalid Author-name condition stays invalid even inside a group that would otherwise prune,
 * while an explicitly omitted query-valued condition is allowed to prune.
 */
function checkCondition(value: unknown): void {
  if (
    isDeferredAliasCondition(value) ||
    (value && typeof value === "object" && predicateBrand in value && value[predicateBrand] === "domain")
  )
    fail(
      "Domain alias conditions are only supported by em.find; use table(...) predicates in SQL queries and mutations.",
    );
  if (value === undefined || value === skipCondition) return;
  if (isInQueryCondition(value)) {
    const q = normalizeQueryJoins(toQuery(value[inQueryCondition].query) as AnyQuery);
    checkCondition(normalizeWhere(q.where));
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || isExpr(value))
    fail("Query predicate must be a condition or an and/or group");
  const condition = value as Record<string, unknown>;
  if ("and" in condition || "or" in condition) {
    if ("and" in condition === "or" in condition) fail("Query conditions require exactly one and/or group");
    const key = "and" in condition ? "and" : "or";
    checkConditionKeys(condition, [key, "pruneIfUndefined"], "Query condition group");
    if (!Array.isArray(condition[key])) fail("Query condition groups require an array");
    if (
      condition.pruneIfUndefined !== undefined &&
      condition.pruneIfUndefined !== "any" &&
      condition.pruneIfUndefined !== "all"
    )
      fail("Invalid query pruneIfUndefined policy");
    for (const child of condition[key]) checkCondition(child);
  } else if ("exists" in condition || "notExists" in condition) {
    const key = "exists" in condition ? "exists" : "notExists";
    checkConditionKeys(condition, [key], "Query existence condition");
    const query = condition[key];
    if (query === undefined) return;
    if (!(query instanceof SubqueryExpr) && !isReadQueryValue(query)) fail(`Query ${key} requires a query(...) value`);
    toQuery(query);
  } else if (condition.kind === "raw") {
    checkConditionKeys(
      condition,
      ["kind", "aliases", "condition", "bindings", "pruneable", deferredSym, predicateBrand],
      "Query raw condition",
    );
    if (
      typeof condition.condition !== "string" ||
      !Array.isArray(condition.aliases) ||
      !condition.aliases.every((alias) => typeof alias === "string") ||
      !Array.isArray(condition.bindings) ||
      typeof condition.pruneable !== "boolean"
    )
      fail("Malformed query raw condition");
  } else if (condition.kind === "column") {
    checkConditionKeys(
      condition,
      ["kind", "alias", "column", "dbType", "cond", "pruneable", predicateBrand],
      "Query column condition",
    );
    if (
      typeof condition.alias !== "string" ||
      typeof condition.column !== "string" ||
      typeof condition.dbType !== "string" ||
      (condition.pruneable !== undefined && typeof condition.pruneable !== "boolean")
    )
      fail("Malformed query column condition");
    const filter = condition.cond as Record<string, unknown> | undefined;
    if (!filter) fail("Malformed query column filter");
    checkConditionKeys(filter, ["kind", "value"], "Query column filter");
    const unary = filter.kind === "is-null" || filter.kind === "not-null";
    if (
      !unary &&
      (![
        "eq",
        "ne",
        "in",
        "nin",
        "gt",
        "gte",
        "lt",
        "lte",
        "like",
        "nlike",
        "ilike",
        "nilike",
        "regex",
        "nregex",
        "iregex",
        "niregex",
        "contains",
        "ncontains",
        "overlaps",
        "noverlaps",
        "containedBy",
        "between",
        "jsonPathExists",
        "jsonPathPredicate",
      ].includes(filter.kind as string) ||
        !("value" in filter))
    )
      fail("Malformed query column filter");
    if (unary && "value" in filter) fail("Unary query filters do not accept values");
  } else {
    fail("Unknown query condition");
  }
}

/** Conditions use own enumerable POJO fields, with predicate-brand and SQL-resolver symbols allowed. */
function checkConditionKeys(value: object, allowed: readonly PropertyKey[], description: string): void {
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    fail(`${description} must be a plain POJO`);
  for (const key of Reflect.ownKeys(value)) {
    if (!allowed.includes(key)) fail(`${description} does not support '${String(key)}'`);
    if (typeof key === "string" && !Object.prototype.propertyIsEnumerable.call(value, key))
      fail(`${description} requires enumerable fields`);
  }
}

/**
 * Converts query-valued predicates to SQL conditions for the shared condition builder.
 * Keeps each subquery's projection and reports its outer aliases for join pruning.
 */
function resolveQueryCondition(cond: QueryCondition | undefined, ctx: Ctx): ConditionInput | undefined {
  if (cond === undefined) return undefined;
  if (isInQueryCondition(cond)) {
    const { column, query } = cond[inQueryCondition];
    const value = createMaybeQueryValue(query as AnyQuery);
    if (value === undefined) return undefined;
    if (!isExpr(value)) return fail("An in query literal must select one expression");
    return column.in(value);
  }
  if ("and" in cond && cond.and) {
    return {
      and: cond.and.map((child) => resolveQueryCondition(child, ctx)),
      pruneIfUndefined: cond.pruneIfUndefined,
    };
  }
  if ("or" in cond && cond.or) {
    return { or: cond.or.map((child) => resolveQueryCondition(child, ctx)), pruneIfUndefined: cond.pruneIfUndefined };
  }
  if ("exists" in cond || "notExists" in cond) {
    const positive = "exists" in cond;
    const subquery = positive ? cond.exists : cond.notExists;
    if (subquery === undefined) return undefined;
    const plan = parseQuery(toQuery(subquery), ctx, ctx.assigner);
    return {
      kind: "raw",
      condition: `${positive ? "EXISTS" : "NOT EXISTS"} (${plan.sql})`,
      bindings: plan.bindings,
      aliases: plan.outerRefs,
      pruneable: false,
    };
  }
  return cond as ConditionInput;
}

function isFilter(cond: ConditionInput): cond is ConditionGroup<ConditionInput> {
  return ("and" in cond && cond.and !== undefined) || ("or" in cond && cond.or !== undefined);
}

/**
 * Checks structural pruning without resolving SQL or correlated aliases.
 *
 * Keeps individual predicates and applies ConditionBuilder's pruning policy (i.e. pruneIfUndefined) to groups.
 * I.e. an Author condition AND an omitted Book condition survives unless the group uses `any`.
 */
function isPrunedQueryCondition(cond: QueryCondition | undefined): boolean {
  if (cond === undefined || cond === skipCondition) return true;
  if (isInQueryCondition(cond)) {
    const q = normalizeQueryJoins(cond[inQueryCondition].query as AnyQuery);
    return isPrunedQueryCondition(normalizeWhere(q.where));
  }
  if ("and" in cond || "or" in cond) {
    const children = (cond.and ?? cond.or ?? []).map(isPrunedQueryCondition);
    return (
      children.every((pruned) => pruned) ||
      ("pruneIfUndefined" in cond && cond.pruneIfUndefined === "any" && children.some((pruned) => pruned))
    );
  }
  if ("exists" in cond) return cond.exists === undefined;
  if ("notExists" in cond) return cond.notExists === undefined;
  return false;
}

/** Recognizes the direct query-literal condition created by EntityColumn.in. */
function isInQueryCondition(value: unknown): value is InQueryCondition {
  return typeof value === "object" && value !== null && inQueryCondition in value;
}

/** The physical source aliases a parsed condition tree references. */
function refsOf(parsed: ParsedExpressionFilter): string[] {
  return deepFindConditions(parsed, false).flatMap((c) =>
    c.kind === "column" ? [c.alias] : c.kind === "raw" ? c.aliases : c.outerAliases,
  );
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
 *
 * CTEs prune on the same rule and through the same dependency map: a `with` entry nothing reads
 * anymore drops with the join that read it, and a CTE read only by another CTE survives with it.
 * A CTE joined into the query shares its alias with that join, so their dependencies are merged.
 *
 * The one join that never prunes is a recursive term's reference to its own CTE: PostgreSQL requires
 * it, so it is not the caller's optional filter (see `Ctx.recursiveSelf`).
 */
function pruneJoins(
  q: AnyQuery,
  ctx: Ctx,
  from: ParsedSource,
  joins: ParsedJoin[],
  ctes: ParsedCte[],
  used: SqlFragment[],
): { joins: ParsedJoin[]; ctes: ParsedCte[] } {
  if (q.pruneJoins === false) return { joins, ctes };
  const deps = new Map<string, string[]>();
  function addDeps(alias: string, refs: readonly string[]): void {
    const own = refs.filter((r) => r !== alias);
    const existing = deps.get(alias);
    if (existing) existing.push(...own);
    else deps.set(alias, own);
  }
  for (const j of joins) addDeps(j.source.alias, [...(j.userOn?.refs ?? []), ...j.source.refs]);
  for (const c of ctes) addDeps(c.alias, c.plan.outerRefs);
  const required = new Set<string>();
  function markRequired(alias: string): void {
    if (required.has(alias)) return;
    required.add(alias);
    for (const dep of deps.get(alias) ?? []) markRequired(dep);
  }
  markRequired(from.alias);
  for (const r of used.flatMap((u) => u.refs)) markRequired(r);
  for (const j of joins) if (j.keep) markRequired(j.source.alias);
  // A recursive term must keep its reference to its own CTE; PostgreSQL rejects a term without one,
  // and pruning it would quietly turn the recursion into a plain select over the base term's table.
  for (const j of joins) if (j.source.handle === ctx.recursiveSelf) markRequired(j.source.alias);
  return {
    joins: joins.filter((j) => required.has(j.source.alias)),
    ctes: ctes.filter((c) => required.has(c.alias)),
  };
}

/**
 * Names and parses each `with` entry, in declaration order.
 *
 * Each entry is in scope before the next is parsed, so a CTE can read an *earlier* sibling by name,
 * PostgreSQL's rule for a non-recursive WITH. A forward reference, or a CTE reading the query's own
 * `from`, fails as "not in this query's from/join", the same error any out-of-scope source gets.
 *
 * I.e. `with: [totals, ranked]` parses `totals` first, so `ranked` can join it, but not the reverse.
 */
export function registerCtes(q: { with?: WithInput }, ctx: Ctx, assigner: AliasAssigner): ParsedCte[] {
  const entries = q.with === undefined ? [] : Array.isArray(q.with) ? q.with : [q.with as WithSource];
  // Each entry is a `query(...)` proxy; unwrap it to its `SubqueryHandle`, the identity `ctx` keys on.
  const handles = entries.filter(isDefined).map(withEntryHandle);
  // Name every entry before parsing any body, so reading a later one is an error, not a silent inline.
  const aliases = handles.map((handle) => assigner.getLiteralAlias(handle.name ?? "cte"));
  handles.forEach((handle, i) => ctx.declareCte(handle, aliases[i]));
  return handles.map((handle, i) => {
    // A recursive CTE's step term reads the CTE itself, so promote it before parsing, not after.
    if (handle.recursive) ctx.promoteCte(handle);
    // Otherwise parse first, then promote: the body sees earlier siblings, but not itself or later ones.
    const plan = parseQuery(handle.q, ctx, assigner, handle.recursive ? handle : undefined);
    if (!handle.recursive) ctx.promoteCte(handle);
    return { alias: aliases[i], plan, recursive: handle.recursive };
  });
}

/** A CTE must be a table shape, so entity-mode and scalar values, which have no columns, are out. */
function withEntryHandle(entry: unknown): SubqueryHandle {
  if (!isSubqueryValue(entry)) {
    fail(
      entry instanceof SubqueryExpr || isEntityQueryValue(entry)
        ? "A `with` entry needs named columns; entity and scalar query(...) values have none"
        : "A `with` entry must be a query(...) value",
    );
  }
  return readValueHandle(entry);
}

/**
 * Drops the CTEs that nothing reads, given the aliases the rest of the statement referenced.
 *
 * A CTE can only read earlier siblings, so going last to first means every CTE that could read this one
 * was already visited, and its own reads are already in `referenced`. That makes one pass enough; first
 * to last would have to repeat until the set stopped growing. `unshift` restores WITH order.
 */
export function pruneCtes(ctes: ParsedCte[], referenced: Set<string>): ParsedCte[] {
  const kept: ParsedCte[] = [];
  for (let i = ctes.length - 1; i >= 0; i--) {
    const cte = ctes[i];
    if (!referenced.has(cte.alias)) continue;
    for (const ref of cte.plan.outerRefs) referenced.add(ref);
    kept.unshift(cte);
  }
  return kept;
}

/**
 * Renders `WITH a AS (...), b AS (...) `, whose bindings lead the statement, as their SQL does.
 *
 * One recursive CTE makes the whole clause `WITH RECURSIVE`, PostgreSQL's rule: the keyword is on the
 * clause, not on the entry that needs it, and it does not force the other entries to be recursive.
 */
export function withFragment(ctes: ParsedCte[]): SqlFragment {
  const recursive = ctes.some((c) => c.recursive) ? " RECURSIVE" : "";
  const sql = ctes.map((c) => `${safeKq(c.alias)} AS (${c.plan.sql})`).join(", ");
  return { sql: `WITH${recursive} ${sql} `, bindings: ctes.flatMap((c) => c.plan.bindings), refs: [] };
}

function asExpr(value: unknown, where: string): BaseExpr {
  if (value instanceof BaseExpr) return value;
  return fail(`${where} must be an expression, i.e. a table column, aggregate, sql\`...\`, or scalar query(...)`);
}

/** Builds inline select expressions while leaving existing expression instances intact. */
function asSelectExpr(value: unknown, where: string): BaseExpr {
  if (value instanceof BaseExpr) return value;
  if (isPlainSelect(value)) return buildExpr(value);
  return fail(`${where} must be a column, an expression, or an expression literal`);
}

function joinFragmentParts(parts: SqlFragment[], sep: string): SqlFragment {
  return { sql: parts.map((p) => p.sql).join(sep), bindings: parts.flatMap((p) => p.bindings), refs: [] };
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

/** Lowers a relationship tree before SQL rendering or output nullability is calculated. */
function normalizeQueryJoins(q: AnyQuery): AnyQuery {
  if (q.join === undefined || Array.isArray(q.join)) return q;
  const tree = compileJoinTree(q.from, q.join);
  return { ...q, join: tree.joins, where: { and: [tree.condition, normalizeWhere(q.where)] } };
}

/** Gives WHERE arrays the same pruning and validation as explicit AND groups. */
function normalizeWhere(where: AnyQuery["where"]): QueryCondition | undefined {
  return Array.isArray(where) ? { and: where } : (where as QueryCondition | undefined);
}

/** Creates the runtime query value after the public signature has checked its input. */
function createQueryValue(q: AnyReadQuery): unknown {
  const handle = new SubqueryHandle(toQuery(q));
  const output = handle.output();
  if (output.kind === "entity") {
    return { [entityQueryBrand]: handle };
  } else if (output.kind === "scalar") {
    return new SubqueryExpr(handle);
  } else {
    return newSubqueryProxy(handle);
  }
}

/** Keeps shorthand declarations callable-only, without recursively copying sql's own shorthand properties. */
function typedSql<R>(strings: TemplateStringsArray, ...values: unknown[]): Expr<R, never> {
  return new TemplateExpr(strings, values) as unknown as Expr<R, never>;
}

import { type ColumnCondition, type RawCondition } from "./QueryParser.ts";

export const predicateBrand: unique symbol = Symbol("joist.predicate");

/** Combines conditions without tying AND/OR or optional-filter pruning to either public API. */
export type ConditionGroup<C> = AndCondition<C> | OrCondition<C>;

/** Requires every surviving condition to match. */
export interface AndCondition<C> {
  and: Array<C | undefined>;
  or?: never;
  pruneIfUndefined?: "any" | "all";
}

/** Requires at least one surviving condition to match. */
export interface OrCondition<C> {
  or: Array<C | undefined>;
  and?: never;
  pruneIfUndefined?: "any" | "all";
}

/** Identifies which API can resolve a predicate's aliases. */
export interface PredicateBrand<K extends "domain" | "sql"> {
  readonly [predicateBrand]: K;
}

/** A predicate built from alias(...) for em.find and scopes. */
export type DomainPredicate = (ColumnCondition | RawCondition) & PredicateBrand<"domain">;

/** A predicate built from table(...), an SQL expression, or sql.condition. */
export type SqlPredicate = (ColumnCondition | RawCondition) & PredicateBrand<"sql">;

/** Existing hand-written conditions remain an escape hatch, but cannot accept a foreign branded predicate. */
export type UnbrandedPredicate = (ColumnCondition | RawCondition) & { readonly [predicateBrand]?: never };

/** SQL predicates and nested AND/OR groups, before query-specific clauses such as EXISTS are added. */
export type SqlCondition = AndCondition<SqlCondition> | OrCondition<SqlCondition> | SqlPredicate | UnbrandedPredicate;

/** Unbranded compiler input shared by domain filtering and SQL queries after public API validation. */
export type ConditionInput =
  | AndCondition<ConditionInput>
  | OrCondition<ConditionInput>
  | ColumnCondition
  | RawCondition;

/** Marks a newly created predicate without changing its enumerable SQL representation. */
export function brandPredicate<C extends object, K extends "domain" | "sql">(cond: C, kind: K): C & PredicateBrand<K> {
  return Object.defineProperty(cond, predicateBrand, { value: kind, enumerable: false }) as C & PredicateBrand<K>;
}

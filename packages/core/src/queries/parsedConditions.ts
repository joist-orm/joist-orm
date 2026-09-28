import type { ParsedFindQuery } from "src/queries/find/QueryParser.ts";
import { assertNever } from "src/utils.ts";

/** A tree of ANDs/ORs with conditions or nested conditions. */
export interface ParsedExpressionFilter {
  kind: "exp";
  op: "and" | "or";
  conditions: ParsedExpressionCondition[];
}

/** A condition or nested condition in a `ParsedExpressionFilter`. */
export type ParsedExpressionCondition = ParsedExpressionFilter | ColumnCondition | RawCondition | ExistsCondition;

export interface ColumnCondition {
  kind: "column";
  alias: string;
  column: string;
  dbType: string;
  cond: ParsedValueFilter<any>;
  /**
   * A pruneable condition is one that was auto-added by something like soft-delete, and shouldn't
   * be something that marks a join as actually used by the user's query.
   */
  pruneable?: boolean;
}

/** A user-provided condition like `SUM(${alias}.amount) > 1000` or `a1.last_name = b1.title`. */
export interface RawCondition {
  kind: "raw";
  /** The aliases, i.e. `[a, b]`, used within the condition, to ensure we don't prune them. */
  aliases: string[];
  /** The condition itself, i.e. `SUM(a.age) DESC`. */
  condition: string;
  /** The bindings within `condition`, i.e. `SUM(${alias}.amount) > ?`. */
  bindings: readonly any[];
  /** Used to mark system-added conditions (like `LATERAL JOIN` conditions), which can be ignored when pruning unused joins. */
  pruneable: boolean;
}

/** An EXISTS or NOT EXISTS subquery condition. */
export interface ExistsCondition {
  kind: "exists";
  /** When true, renders as NOT EXISTS. */
  negate: boolean;
  /** The subquery: SELECT 1 FROM child WHERE correlation AND filter. */
  subquery: ParsedFindQuery;
  /** Outer aliases referenced by the correlation predicate, for join pruning. */
  outerAliases: string[];
}

/** An ADT version of `ValueFilter`. */
export type ParsedValueFilter<V> =
  | { kind: "eq"; value: V }
  | { kind: "in"; value: readonly V[] }
  | { kind: "nin"; value: readonly V[] }
  | { kind: "gt"; value: V }
  | { kind: "gte"; value: V }
  | { kind: "ne"; value: V }
  | { kind: "is-null" }
  | { kind: "not-null" }
  | { kind: "lt"; value: V }
  | { kind: "lte"; value: V }
  | { kind: "like"; value: V }
  | { kind: "nlike"; value: V }
  | { kind: "ilike"; value: V }
  | { kind: "nilike"; value: V }
  | { kind: "regex"; value: V }
  | { kind: "nregex"; value: V }
  | { kind: "iregex"; value: V }
  | { kind: "niregex"; value: V }
  | { kind: "contains"; value: readonly V[] }
  | { kind: "ncontains"; value: readonly V[] }
  | { kind: "overlaps"; value: readonly V[] }
  | { kind: "noverlaps"; value: readonly V[] }
  | { kind: "containedBy"; value: readonly V[] }
  | { kind: "between"; value: [V, V] }
  | { kind: "jsonPathExists"; value: string }
  | { kind: "jsonPathPredicate"; value: string };

/** Pulls out a flat list of all `ColumnCondition`s from a `ParsedExpressionFilter` tree. */
export function deepFindConditions(
  condition: ParsedExpressionFilter | undefined,
  filterPruneable: boolean,
): (ColumnCondition | RawCondition | ExistsCondition)[] {
  const todo = condition ? [condition] : [];
  const result: (ColumnCondition | RawCondition | ExistsCondition)[] = [];
  while (todo.length !== 0) {
    const cc = todo.pop()!;
    for (const c of cc.conditions) {
      if (c.kind === "exp") {
        todo.push(c);
      } else if (c.kind === "column" || c.kind === "raw") {
        if (!filterPruneable || !c.pruneable) result.push(c);
      } else if (c.kind === "exists") {
        result.push(c);
      } else {
        assertNever(c);
      }
    }
  }
  return result;
}

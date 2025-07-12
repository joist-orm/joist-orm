import { ExpressionFilter } from "./EntityFilter";
import { isDefined } from "./EntityManager";
import {
  ColumnCondition,
  ExistsCondition,
  mapToDb,
  ParsedExpressionCondition,
  ParsedExpressionFilter,
  ParsedValueFilter,
  RawCondition,
  skipCondition,
} from "./QueryParser";
import { Column } from "./serde";
import { assertNever, partition } from "./utils";

type PartialSome<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Converts domain-level values like string ids/enums into their db equivalent. */
export class ConditionBuilder {
  /** Simple, single-column conditions, which will be AND-d together. */
  private conditions: (ColumnCondition | RawCondition | ExistsCondition)[] = [];
  /** Complex expressions, which will also be AND-d together with `conditions`. */
  private expressions: ParsedExpressionFilter[] = [];

  /** Accepts a raw user-facing DSL filter, and parses it into a `ParsedExpressionFilter`. */
  maybeAddExpression(expression: ExpressionFilter): void {
    const parsed = parseExpression(expression);
    if (parsed) this.expressions.push(parsed);
  }

  /** Adds an already-db-level condition to the simple conditions list. */
  addSimpleCondition(condition: ColumnCondition | ExistsCondition): void {
    this.conditions.push(condition);
  }

  /** Adds an already-db-level condition to the simple conditions list. */
  addRawCondition(condition: PartialSome<RawCondition, "kind" | "bindings">): void {
    this.conditions.push({
      kind: "raw",
      bindings: [],
      ...condition,
    });
  }

  /** Adds an already-db-level expression to the expressions list. */
  addParsedExpression(parsed: ParsedExpressionFilter): void {
    this.expressions.push(parsed);
  }

  /**
   * Adds a user-facing `ParsedValueFilter` to the inline conditions.
   *
   * Unless it's something like `in: [a1, null]`, in which case we split it into two `is-null` and `in` conditions.
   */
  addValueFilter(alias: string, column: Column, filter: ParsedValueFilter<any>): void {
    if (filter.kind === "in" && filter.value.includes(null)) {
      // If the filter contains a null, we need to split it into an `is-null` and `in` condition
      const isNull = {
        kind: "column",
        alias,
        column: column.columnName,
        dbType: column.dbType,
        cond: { kind: "is-null" },
      } satisfies ColumnCondition;
      const inValues = {
        kind: "column",
        alias,
        column: column.columnName,
        dbType: column.dbType,
        cond: {
          kind: "in",
          // Filter out the nulls from the in condition
          value: filter.value.filter((v) => v !== null).map((v) => column.mapToDb(v)),
        },
      } satisfies ColumnCondition;
      // Now OR them back together
      this.expressions.push({ kind: "exp", op: "or", conditions: [isNull, inValues] });
    } else {
      const cond = {
        kind: "column",
        alias,
        column: column.columnName,
        dbType: column.dbType,
        // Rewrite the user-facing domain values to db values
        cond: mapToDb(column, filter),
      } satisfies ColumnCondition;
      this.conditions.push(cond);
    }
  }

  /** Combines our collected `conditions` & `expressions` into a single `ParsedExpressionFilter`. */
  toExpressionFilter(): ParsedExpressionFilter | undefined {
    const { expressions, conditions } = this;
    if (conditions.length === 0 && expressions.length === 1) {
      // If no inline conditions, and just 1 opt expression, just use that
      return expressions[0];
    } else if (expressions.length === 1 && expressions[0].op === "and") {
      // Merge the 1 `AND` expression with the other simple conditions
      return { kind: "exp", op: "and", conditions: [...conditions, ...expressions[0].conditions] };
    } else if (conditions.length > 0 || expressions.length > 0) {
      // Combine the conditions within the `em.find` join literal & the `conditions` as ANDs
      return { kind: "exp", op: "and", conditions: [...conditions, ...expressions] };
    }
    return undefined;
  }

  /**
   * Finds `child.column.eq(...)` complex conditions that need pushed down into each lateral join.
   *
   * Once we find something like `{ column: "first_name", cond: { eq: "a1" } }`, we return it to the
   * caller (for injection into the lateral join's `SELECT` clause), and replace it with a boolean
   * expression that is basically "did any of my children match this condition?".
   *
   * We also assume that `findAndRewrite` is only called on the top-level/user-facing `ParsedFindQuery`,
   * and not any intermediate `CteJoinTable` queries (which are allowed to have their own
   * `ConditionBuilder`s for building their internal query, but it's not exposed to the user,
   * so won't have any truly-complex conditions that should need rewritten).
   *
   * @param topLevelLateralJoin the outermost lateral join alias, as that will be the only alias
   *   that is visible to the rewritten condition, i.e. `_alias._whatever_condition_`.
   * @param alias the alias being "hidden" in a lateral join, and so its columns/data won't be
   *   available for the top-level condition to directly AND/OR against.
   */
  findAndRewrite(topLevelLateralJoin: string, alias: string): { cond: ColumnCondition; as: string }[] {
    let j = 0;
    const found: { cond: ColumnCondition; as: string }[] = [];
    const todo: ParsedExpressionCondition[][] = [this.conditions];
    for (const exp of this.expressions) todo.push(exp.conditions);
    while (todo.length > 0) {
      const array = todo.pop()!;
      array.forEach((cond, i) => {
        if (cond.kind === "column") {
          // Use startsWith to look for `_b0` / `_s0` base/subtype conditions
          if (cond.alias === alias || cond.alias.startsWith(`${alias}_`)) {
            if (cond.column === "_") return; // Hack to skip rewriting `alias._ > 0`
            const as = `_${alias}_${cond.column}_${j++}`;
            array[i] = {
              kind: "raw",
              aliases: [topLevelLateralJoin],
              condition: `${topLevelLateralJoin}.${as}`,
              bindings: [],
              pruneable: false,
              ...{ rewritten: true },
            } satisfies RawCondition;
            found.push({ cond, as });
          }
        } else if (cond.kind === "exp") {
          todo.push(cond.conditions);
        } else if (cond.kind === "raw") {
          // what would we do here?
          if (cond.aliases.includes(alias)) {
            // Look for a hacky hint that this is our own already-rewritten query; this is likely
            // because `findAndRewrite` is mutating condition expressions that get passed into
            // `parseFindQuery` multiple times, i.e. while batching/dataloading.
            //
            // ...although in theory parseExpression should already be making a copy of any user-facing
            // `em.find` conditions. :thinking:
            if ("rewritten" in cond) return;
            throw new Error("Joist doesn't support raw conditions in lateral joins yet");
          }
        } else if (cond.kind === "exists") {
          // For exists conditions with a subquery, we might need to recurse into the subquery
          // but for now, we'll just skip handling lateral joins within EXISTS subqueries
          // TODO: Add proper handling if needed
        } else {
          assertNever(cond);
        }
      });
    }
    return found;
  }
}

/** Parses user-facing `{ and: ... }` or `{ or: ... }` into a `ParsedExpressionFilter`. */
function parseExpression(expression: ExpressionFilter): ParsedExpressionFilter | undefined {
  // Look for `{ and: [...] }` or `{ or: [...] }`
  const [op, expressions] =
    "and" in expression && expression.and
      ? ["and" as const, expression.and]
      : "or" in expression && expression.or
        ? ["or" as const, expression.or]
        : fail(`Invalid expression ${expression}`);
  // Potentially recurse into nested expressions
  const conditions = expressions.map((exp) => (exp && ("and" in exp || "or" in exp) ? parseExpression(exp) : exp));
  const [skip, valid] = partition(conditions, (cond) => cond === undefined || cond === skipCondition);
  if ((skip.length > 0 && expression.pruneIfUndefined === "any") || valid.length === 0) {
    return undefined;
  }
  return { kind: "exp", op, conditions: valid.filter(isDefined) };
}

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
import { partition } from "./utils";

type PartialSome<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Converts domain-level values like string ids/enums into their db equivalent. */
export class ConditionBuilder {
  /** Simple, single-column conditions, which will be AND-d together. */
  private conditions: (ColumnCondition | RawCondition)[] = [];
  /** Complex expressions, which will also be AND-d together with `conditions`. */
  private expressions: ParsedExpressionFilter[] = [];
  /** EXISTS conditions, which will be AND-d with the rest. */
  private existsConditions: ExistsCondition[] = [];

  /** Accepts a raw user-facing DSL filter, and parses it into a `ParsedExpressionFilter`. */
  maybeAddExpression(expression: ExpressionFilter): void {
    const parsed = parseExpression(expression);
    if (parsed) this.expressions.push(parsed);
  }

  /** Adds an already-db-level condition to the simple conditions list. */
  addSimpleCondition(condition: ColumnCondition): void {
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

  /** Adds an EXISTS/NOT EXISTS condition to be AND-d with the rest. */
  addExistsCondition(exists: ExistsCondition): void {
    this.existsConditions.push(exists);
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

  /** Combines our collected `conditions` & `expressions` & `existsConditions` into a single `ParsedExpressionFilter`. */
  toExpressionFilter(): ParsedExpressionFilter | undefined {
    const { expressions, conditions, existsConditions } = this;
    const allSimple: ParsedExpressionCondition[] = [...conditions, ...existsConditions];
    if (allSimple.length === 0 && expressions.length === 1) {
      // If no inline/exists conditions, and just 1 opt expression, just use that
      return expressions[0];
    } else if (expressions.length === 1 && expressions[0].op === "and") {
      // Merge the 1 `AND` expression with the other simple conditions
      return { kind: "exp", op: "and", conditions: [...allSimple, ...expressions[0].conditions] };
    } else if (allSimple.length > 0 || expressions.length > 0) {
      // Combine the conditions within the `em.find` join literal & the `conditions` as ANDs
      return { kind: "exp", op: "and", conditions: [...allSimple, ...expressions] };
    }
    return undefined;
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

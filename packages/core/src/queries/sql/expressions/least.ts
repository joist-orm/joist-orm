import type { ExprContext, SqlFragment } from "src/queries/sql/Expr.ts";
import { expressionNullable, functionToSql } from "src/queries/sql/expressions/expression.ts";
import { parseNonEmptyOperands } from "src/queries/sql/expressions/parseExpression.ts";
import type { ParsedExpression, ResultCodec } from "src/queries/sql/expressions/types.ts";

/** Values whose smallest non-null member is selected by PostgreSQL. */
export interface LeastInput {
  readonly least: readonly unknown[];
}

/** A LEAST comparison with at least one value. */
export interface ParsedLeastExpression {
  kind: "least";
  values: [ParsedExpression, ...ParsedExpression[]];
}

/** Parses LEAST values and requires at least one operand. */
export function parseLeastExpression(input: unknown): ParsedLeastExpression {
  return { kind: "least", values: parseNonEmptyOperands(input, "LEAST") };
}

/** Renders the values compared by LEAST. */
export function leastToSql(parsed: ParsedLeastExpression, ctx: ExprContext, codec: ResultCodec): SqlFragment {
  return functionToSql("LEAST", parsed.values, ctx, codec);
}

/** LEAST ignores nulls, so one non-null value guarantees a non-null result. */
export function leastNullable(parsed: ParsedLeastExpression): boolean | undefined {
  return parsed.values.some((value) => expressionNullable(value) === false) ? false : undefined;
}

import type { ExprContext, SqlFragment } from "../Expr.ts";
import { expressionNullable, functionToSql } from "./expression.ts";
import { parseNonEmptyOperands } from "./parseExpression.ts";
import type { ParsedExpression, ResultCodec } from "./types.ts";

/** Values whose largest non-null member is selected by PostgreSQL. */
export interface GreatestInput {
  readonly greatest: readonly unknown[];
}

/** A GREATEST comparison with at least one value. */
export interface ParsedGreatestExpression {
  kind: "greatest";
  values: [ParsedExpression, ...ParsedExpression[]];
}

/** Parses GREATEST values and requires at least one operand. */
export function parseGreatestExpression(input: unknown): ParsedGreatestExpression {
  return { kind: "greatest", values: parseNonEmptyOperands(input, "GREATEST") };
}

/** Renders the values compared by GREATEST. */
export function greatestToSql(parsed: ParsedGreatestExpression, ctx: ExprContext, codec: ResultCodec): SqlFragment {
  return functionToSql("GREATEST", parsed.values, ctx, codec);
}

/** GREATEST ignores nulls, so one non-null value guarantees a non-null result. */
export function greatestNullable(parsed: ParsedGreatestExpression): boolean | undefined {
  return parsed.values.some((value) => expressionNullable(value) === false) ? false : undefined;
}

import type { ExprContext, SqlFragment } from "src/queries/sql/Expr.ts";
import { expressionNullable, functionToSql } from "src/queries/sql/expressions/expression.ts";
import { parseNonEmptyOperands } from "src/queries/sql/expressions/parseExpression.ts";
import type { ParsedExpression, ResultCodec } from "src/queries/sql/expressions/types.ts";

/** Candidates in order of preference; COALESCE returns the first non-null value. */
export interface CoalesceInput {
  readonly coalesce: readonly unknown[];
}

/** A COALESCE with at least one candidate, in SQL evaluation order. */
export interface ParsedCoalesceExpression {
  kind: "coalesce";
  candidates: [ParsedExpression, ...ParsedExpression[]];
}

/** Parses COALESCE candidates and requires at least one value. */
export function parseCoalesceExpression(input: unknown): ParsedCoalesceExpression {
  return { kind: "coalesce", candidates: parseNonEmptyOperands(input, "COALESCE") };
}

/** Renders COALESCE candidates in their original order. */
export function coalesceToSql(parsed: ParsedCoalesceExpression, ctx: ExprContext, codec: ResultCodec): SqlFragment {
  return functionToSql("COALESCE", parsed.candidates, ctx, codec);
}

/** One non-null candidate guarantees a non-null COALESCE result. */
export function coalesceNullable(parsed: ParsedCoalesceExpression): boolean | undefined {
  return parsed.candidates.some((candidate) => expressionNullable(candidate) === false) ? false : undefined;
}

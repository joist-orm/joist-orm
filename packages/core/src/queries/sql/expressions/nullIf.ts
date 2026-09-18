import type { ExprContext, SqlFragment } from "src/queries/sql/Expr.ts";
import { functionToSql } from "src/queries/sql/expressions/expression.ts";
import { parseExpression } from "src/queries/sql/expressions/parseExpression.ts";
import type { ParsedExpression, ResultCodec } from "src/queries/sql/expressions/types.ts";

/** A value and the value it must equal for NULLIF to return SQL NULL. */
export interface NullIfInput {
  readonly nullIf: readonly unknown[];
}

/** NULLIF returns value unless it matches equals. */
export interface ParsedNullIfExpression {
  kind: "nullIf";
  value: ParsedExpression;
  equals: ParsedExpression;
}

/** Parses exactly two NULLIF operands into their distinct roles. */
export function parseNullIfExpression(input: unknown): ParsedNullIfExpression {
  if (!Array.isArray(input) || input.length !== 2) throw new Error("NULLIF needs exactly two values");
  return { kind: "nullIf", value: parseExpression(input[0]), equals: parseExpression(input[1]) };
}

/** Renders the returned value before its equality comparison operand. */
export function nullIfToSql(parsed: ParsedNullIfExpression, ctx: ExprContext, codec: ResultCodec): SqlFragment {
  return functionToSql("NULLIF", [parsed.value, parsed.equals], ctx, codec);
}

/** NULLIF can return SQL NULL when its operands match. */
export function nullIfNullable(): true {
  return true;
}

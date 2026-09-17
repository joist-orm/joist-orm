import { BaseExpr, type ExprContext, type SqlFragment, joinFragments } from "../Expr.ts";
import { assertNever } from "../utils.ts";
import { caseToSql } from "./case.ts";
import { coalesceToSql } from "./coalesce.ts";
import { greatestToSql } from "./greatest.ts";
import { leastToSql } from "./least.ts";
import { nullIfToSql } from "./nullIf.ts";
import type { ParsedExpression, ResultCodec } from "./types.ts";

/**
 * Renders a ParsedExpression in SQL binding order, resolving CASE conditions and collecting references for join pruning.
 * An omitted CASE condition removes its value as well. I.e. an unused Book.title branch must not keep the Book join.
 */
export function expressionToSql(parsed: ParsedExpression, ctx: ExprContext, codec: ResultCodec): SqlFragment {
  if (parsed instanceof BaseExpr) return parsed.toSql(ctx);
  switch (parsed.kind) {
    case "literal": {
      const dbType = codec.outputType?.dbType;
      return {
        sql: dbType ? `?::${dbType}` : "?",
        bindings: [parsed.value === null ? null : codec.encode(parsed.value)],
        refs: [],
      };
    }
    case "coalesce":
      return coalesceToSql(parsed, ctx, codec);
    case "nullIf":
      return nullIfToSql(parsed, ctx, codec);
    case "greatest":
      return greatestToSql(parsed, ctx, codec);
    case "least":
      return leastToSql(parsed, ctx, codec);
    case "case":
      return caseToSql(parsed, ctx, codec);
    default:
      return assertNever(parsed);
  }
}

/** Renders a function call after its parsed kind has supplied the arguments in SQL order. */
export function functionToSql(
  name: string,
  args: readonly ParsedExpression[],
  ctx: ExprContext,
  codec: ResultCodec,
): SqlFragment {
  const parts = joinFragments(
    args.map((arg) => expressionToSql(arg, ctx, codec)),
    ", ",
  );
  return { ...parts, sql: `${name}(${parts.sql})` };
}

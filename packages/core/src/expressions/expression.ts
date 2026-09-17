import { BaseExpr, type ExprContext, type SqlFragment, joinFragments } from "../Expr.ts";
import type { TypeInfo } from "../TypeInfo.ts";
import { assertNever } from "../utils.ts";
import { caseNullable, caseToSql } from "./case.ts";
import { coalesceNullable, coalesceToSql } from "./coalesce.ts";
import { chooseExpressionCodec } from "./codecs.ts";
import { greatestNullable, greatestToSql } from "./greatest.ts";
import { leastNullable, leastToSql } from "./least.ts";
import { nullIfNullable, nullIfToSql } from "./nullIf.ts";
import { parseExpressionInput } from "./parseExpression.ts";
import type { CheckInput, ExprFromInput, ExprInput, ParsedExpression, ResultCodec } from "./types.ts";

export type { CaseElse, CaseWhen } from "./case.ts";
export type { CheckInput, ExprFromInput, ExprInput, ExpressionSources, ExpressionValue } from "./types.ts";

/** Builds a reusable SQL value expression, binding literal values as parameters. */
export function expr<const I extends ExprInput>(input: I & CheckInput<NoInfer<I>>): ExprFromInput<I> {
  return buildExpr(input) as unknown as ExprFromInput<I>;
}

/** Parses explicit and inline inputs into a ParsedExpression, then wraps it in an Expr with a result codec. */
export function buildExpr(input: unknown): BaseExpr {
  return new ObjectExpr(parseExpressionInput(input));
}

/** Exposes a ParsedExpression through the Expr methods, SQL rendering, and shared result codec. */
class ObjectExpr extends BaseExpr {
  private readonly codec: ResultCodec;

  constructor(private readonly parsed: ParsedExpression) {
    super();
    this.codec = chooseExpressionCodec(parsed);
  }

  get outputType(): TypeInfo | undefined {
    return this.codec.outputType;
  }

  get sqlNullable(): boolean | undefined {
    return expressionNullable(this.parsed);
  }

  toSql(ctx: ExprContext): SqlFragment {
    return expressionToSql(this.parsed, ctx, this.codec);
  }

  decode(value: unknown): unknown {
    return value == null ? value : this.codec.decode(value);
  }

  encode(value: unknown): unknown {
    return value == null ? value : this.codec.encode(value);
  }
}

/**
 * Reports nullability from the fields of each parsed expression kind.
 * A direct column can become null through a LEFT join, so only independent values prove NOT NULL here.
 */
export function expressionNullable(parsed: ParsedExpression): boolean | undefined {
  if (parsed instanceof BaseExpr) return parsed.sqlSource ? undefined : parsed.sqlNullable;
  switch (parsed.kind) {
    case "literal":
      return parsed.value === null;
    case "nullIf":
      return nullIfNullable();
    case "coalesce":
      return coalesceNullable(parsed);
    case "greatest":
      return greatestNullable(parsed);
    case "least":
      return leastNullable(parsed);
    case "case":
      return caseNullable(parsed);
    default:
      return assertNever(parsed);
  }
}

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

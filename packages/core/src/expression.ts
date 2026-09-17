import { BaseExpr, type ExprContext, type SqlFragment } from "./Expr.ts";
import { chooseExpressionCodec } from "./expressions/codecs.ts";
import { expressionNullable } from "./expressions/expressionNullable.ts";
import { expressionToSql } from "./expressions/expressionToSql.ts";
import { parseExpressionInput } from "./expressions/parseExpression.ts";
import type { CheckInput, ExprFromInput, ExprInput, ParsedExpression, ResultCodec } from "./expressions/types.ts";
import type { TypeInfo } from "./TypeInfo.ts";

export type { CaseElse, CaseWhen } from "./expressions/case.ts";
export { isExprInput } from "./expressions/parseExpression.ts";
export type { CheckInput, ExprFromInput, ExprInput, ExpressionSources, ExpressionValue } from "./expressions/types.ts";

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

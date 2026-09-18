import {
  type ArrayAggOptions,
  BaseExpr,
  type ExprContext,
  type ExprLike,
  type SqlFragment,
  joinFragments,
  orderByToSql,
} from "src/queries/sql/Expr.ts";
import { expressionToSql } from "src/queries/sql/expressions/expression.ts";
import { checkKeys, isObject, parseExpression } from "src/queries/sql/expressions/parseExpression.ts";
import type { ParsedExpression, ResultCodec } from "src/queries/sql/expressions/types.ts";

/** The aggregate value alone, or the value together with PostgreSQL aggregate options. */
export interface ArrayAggInput {
  readonly arrayAgg: ExprLike<unknown> | ArrayAggExpressionOptions;
}

/** Options for an inline ARRAY_AGG expression. */
export interface ArrayAggExpressionOptions extends ArrayAggOptions {
  readonly value: unknown;
}

/** An ARRAY_AGG value and its aggregate options. */
export interface ParsedArrayAggExpression {
  kind: "arrayAgg";
  value: ParsedExpression;
  options?: ArrayAggOptions;
}

/** Parses compact and expanded ARRAY_AGG inputs. */
export function parseArrayAggExpression(input: unknown): ParsedArrayAggExpression {
  if (input instanceof BaseExpr || !isArrayAggOptions(input)) {
    return { kind: "arrayAgg", value: parseExpression(input) };
  }
  checkKeys(input, ["value", "distinct", "orderBy", "filter"]);
  if (!("value" in input)) throw new Error("ARRAY_AGG options need a value");
  if (input.distinct !== undefined && typeof input.distinct !== "boolean") {
    throw new Error("ARRAY_AGG distinct must be a boolean");
  }
  if (input.orderBy !== undefined && !Array.isArray(input.orderBy)) {
    throw new Error("ARRAY_AGG orderBy must be an array");
  }
  return {
    kind: "arrayAgg",
    value: parseExpression(input.value),
    options: {
      distinct: input.distinct as boolean | undefined,
      orderBy: input.orderBy as ArrayAggOptions["orderBy"],
      filter: input.filter as ArrayAggOptions["filter"],
    },
  };
}

/** Renders ARRAY_AGG's value, ordering, and filter in SQL binding order. */
export function arrayAggToSql(
  parsed: ParsedArrayAggExpression,
  ctx: ExprContext,
  valueCodec: ResultCodec,
): SqlFragment {
  const value = expressionToSql(parsed.value, ctx, valueCodec);
  const ordering = joinFragments(
    (parsed.options?.orderBy ?? []).flatMap((entry) => {
      if (entry === undefined) return [];
      const fragment = orderByToSql(entry, ctx);
      return fragment ? [fragment] : [];
    }),
    ", ",
  );
  const filter = parsed.options?.filter;
  const condition = filter === undefined ? undefined : ctx.conditionToSql(filter);
  return {
    sql: `array_agg(${parsed.options?.distinct ? "DISTINCT " : ""}${value.sql}${ordering.sql ? ` ORDER BY ${ordering.sql}` : ""})${condition ? ` FILTER (WHERE ${condition.sql})` : ""}`,
    bindings: [...value.bindings, ...ordering.bindings, ...(condition?.bindings ?? [])],
    refs: [...value.refs, ...ordering.refs, ...(condition?.refs ?? [])],
  };
}

/** Distinguishes expanded options from nested object expressions. */
function isArrayAggOptions(input: unknown): input is Record<string, unknown> {
  return isObject(input) && ("value" in input || "distinct" in input || "orderBy" in input || "filter" in input);
}

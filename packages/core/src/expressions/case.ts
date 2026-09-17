import { type ExprContext, type SqlFragment, joinFragments } from "../Expr.ts";
import type { QueryCondition } from "../query.ts";
import { expressionNullable, expressionToSql } from "./expression.ts";
import { checkKeys, isObject, parseExpression } from "./parseExpression.ts";
import type { ParsedExpression, ResultCodec } from "./types.ts";

/** One condition and the value to return when it is true. */
export interface CaseWhen {
  readonly when: QueryCondition | undefined;
  readonly then: unknown;
  readonly else?: never;
}

/** The fallback value, allowed only as the last entry in a CASE array. */
export interface CaseElse {
  readonly else: unknown;
  readonly when?: never;
  readonly then?: never;
}

/** A single WHEN or an ordered array of WHEN entries with an optional final ELSE. */
export interface CaseInput {
  readonly case: CaseWhen | readonly (CaseWhen | CaseElse)[];
}

/** A CASE has at least one WHEN and an optional ELSE; no ELSE means SQL NULL. */
export interface ParsedCaseExpression {
  kind: "case";
  whens: [ParsedCaseWhen, ...ParsedCaseWhen[]];
  else?: ParsedExpression;
}

/** A CASE condition and its parsed result expression. */
interface ParsedCaseWhen {
  when: QueryCondition | undefined;
  then: ParsedExpression;
}

/**
 * Parses WHEN entries and an optional final ELSE into a ParsedCaseExpression.
 * Requires at least one WHEN, even if its condition may later be pruned.
 */
export function parseCaseExpression(input: unknown): ParsedCaseExpression {
  const entries = Array.isArray(input) ? input : [input];
  const whens: ParsedCaseWhen[] = [];
  let fallback: ParsedExpression | undefined;
  for (const [i, entry] of entries.entries()) {
    if (isObject(entry) && "else" in entry) {
      checkKeys(entry, ["else"]);
      if (whens.length === 0) throw new Error("CASE needs a WHEN arm before ELSE");
      if (i !== entries.length - 1) throw new Error("CASE ELSE must be last");
      fallback = parseExpression(entry.else);
    } else {
      if (!isObject(entry) || !("when" in entry) || !("then" in entry))
        throw new Error("A CASE arm needs when and then");
      checkKeys(entry, ["when", "then"]);
      whens.push({ when: entry.when as QueryCondition | undefined, then: parseExpression(entry.then) });
    }
  }
  if (whens.length === 0) throw new Error("CASE needs at least one arm");
  const [first, ...rest] = whens;
  return { kind: "case", whens: [first, ...rest], else: fallback };
}

/** Removes CASE entries with omitted conditions, falling back to ELSE or SQL NULL if none remain. */
export function caseToSql(parsed: ParsedCaseExpression, ctx: ExprContext, codec: ResultCodec): SqlFragment {
  const parts: SqlFragment[] = [];
  for (const entry of parsed.whens) {
    const when = entry.when === undefined ? undefined : ctx.conditionToSql(entry.when);
    if (!when) continue;
    const branch = joinFragments([when, expressionToSql(entry.then, ctx, codec)], " THEN ");
    parts.push({ ...branch, sql: `WHEN ${branch.sql}` });
  }
  const otherwise = expressionToSql(parsed.else ?? { kind: "literal", value: null }, ctx, codec);
  if (parts.length === 0) return otherwise;
  if (parsed.else) parts.push({ ...otherwise, sql: `ELSE ${otherwise.sql}` });
  const body = joinFragments(parts, " ");
  return { ...body, sql: `(CASE ${body.sql} END)` };
}

/** CASE is definitely non-null only when every THEN value and the ELSE value are non-null. */
export function caseNullable(parsed: ParsedCaseExpression): boolean | undefined {
  return parsed.else &&
    expressionNullable(parsed.else) === false &&
    parsed.whens.every((entry) => expressionNullable(entry.then) === false)
    ? false
    : undefined;
}

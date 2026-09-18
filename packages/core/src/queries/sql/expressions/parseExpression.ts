import { assertNever } from "../../../utils.ts";
import { BaseExpr } from "../Expr.ts";
import { parseArrayAggExpression } from "./arrayAgg.ts";
import { parseCaseExpression } from "./case.ts";
import { parseCoalesceExpression } from "./coalesce.ts";
import { parseGreatestExpression } from "./greatest.ts";
import { parseLeastExpression } from "./least.ts";
import { parseNullIfExpression } from "./nullIf.ts";
import type { ExprName, ParsedExpression } from "./types.ts";

// These expressions take operand arrays; CASE uses WHEN/THEN entries instead.
const exprNames = ["coalesce", "nullIf", "greatest", "least"] as const satisfies readonly ExprName[];

/** Requires an expression object at the root before parsing its nested operands. */
export function parseExpressionInput(input: unknown): ParsedExpression {
  if (!isObject(input) || (!("case" in input) && !("arrayAgg" in input) && !exprNames.some((name) => name in input))) {
    throw new Error("expr expects an object with arrayAgg, case, coalesce, nullIf, greatest, or least");
  }
  return parseExpression(input);
}

/**
 * Parses expression inputs into a ParsedExpression, validating their shape and copying operand arrays.
 * Nested expressions stay together so their literals can use a column's codec from another branch.
 * I.e. COALESCE(Book.id, CASE ... THEN "b:9" END) must encode "b:9" as an integer.
 */
export function parseExpression(input: unknown): ParsedExpression {
  if (input instanceof BaseExpr) return input;
  if (input === undefined) throw new Error("Use null for a SQL NULL value");
  const name = isObject(input) ? exprNames.find((name) => name in input) : undefined;
  if (name && isObject(input)) {
    checkKeys(input, [name]);
    switch (name) {
      case "coalesce":
        return parseCoalesceExpression(input.coalesce);
      case "nullIf":
        return parseNullIfExpression(input.nullIf);
      case "greatest":
        return parseGreatestExpression(input.greatest);
      case "least":
        return parseLeastExpression(input.least);
      default:
        return assertNever(name);
    }
  }
  if (isObject(input) && "arrayAgg" in input) {
    checkKeys(input, ["arrayAgg"]);
    return parseArrayAggExpression(input.arrayAgg);
  }
  if (isObject(input) && "case" in input) {
    checkKeys(input, ["case"]);
    return parseCaseExpression(input.case);
  }
  return { kind: "literal", value: input };
}

/** Validates and copies a nonempty operand array, preserving its first element in the parsed type. */
export function parseNonEmptyOperands(input: unknown, name: string): [ParsedExpression, ...ParsedExpression[]] {
  if (!Array.isArray(input) || input.length === 0) throw new Error(`${name} needs at least one value`);
  // Validation above guarantees a first operand; keep that guarantee in the parsed type.
  const [first, ...rest] = input;
  return [parseExpression(first), ...rest.map((operand) => parseExpression(operand))];
}

/** Rejects misspelled or mixed expression keys rather than silently ignoring them. */
export function checkKeys(value: object, allowed: string[]): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key)) throw new Error(`Unknown expression key '${String(key)}'`);
  }
}

/** Narrows expression input objects without treating null as an object. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

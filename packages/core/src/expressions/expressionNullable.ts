import { BaseExpr } from "../Expr.ts";
import { assertNever } from "../utils.ts";
import { caseNullable } from "./case.ts";
import { coalesceNullable } from "./coalesce.ts";
import { greatestNullable } from "./greatest.ts";
import { leastNullable } from "./least.ts";
import { nullIfNullable } from "./nullIf.ts";
import type { ParsedExpression } from "./types.ts";

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

import {
  ColumnCondition,
  ParsedExpressionCondition,
  ParsedExpressionFilter,
  ParsedFindQuery,
  RawCondition,
} from "./QueryParser";
import { assertNever } from "./utils";

/** A generic visitor over the simple & complex conditions of a query. */
interface Visitor {
  visitExp?(c: ParsedExpressionFilter): ParsedExpressionFilter | void;
  visitRaw?(c: RawCondition): RawCondition | ParsedExpressionFilter | void;
  visitCond(c: ColumnCondition): ColumnCondition | ParsedExpressionFilter | RawCondition | void;
}

/**
 * Visits the nested conditions within `query`.
 *
 * If the visitors return a new condition or expression, the returned expression
 * will replace the original one at that location in the expression.
 */
export function visitConditions(query: ParsedFindQuery, visitor: Visitor): void {
  const todo = [query];
  while (todo.length > 0) {
    const query = todo.pop()!;
    if (query.condition) visitFilter(query.condition, visitor);
    for (const table of query.tables) {
      if (table.join === "lateral" || table.join === "cte") {
        todo.push(table.query);
      }
    }
  }
}

export function visitFilter(pc: ParsedExpressionCondition, visitor: Visitor) {
  if (pc.kind === "exp") {
    pc.conditions.forEach((c, i) => {
      if (c.kind === "column") {
        const result = visitor.visitCond(c);
        if (result) {
          pc.conditions[i] = result;
        }
      } else if (c.kind === "exp") {
        const result = visitor.visitExp?.(c);
        if (result) pc.conditions[i] = result;
        visitFilter(result ?? c, visitor);
      } else if (c.kind === "raw") {
        const result = visitor.visitRaw?.(c);
        if (result) {
          pc.conditions[i] = result;
        }
      } else {
        assertNever(c);
      }
    });
  } else if (pc.kind === "column") {
    const result = visitor.visitCond(pc);
    if (result) {
      throw new Error("ParsedExpressionCondition overload not support mutating the condition");
    }
  } else if (pc.kind === "raw") {
    const result = visitor.visitRaw?.(pc);
    if (result) {
      throw new Error("ParsedExpressionCondition overload not support mutating the condition");
    }
  } else {
    assertNever(pc);
  }
}

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
  visitCond(c: ColumnCondition): ColumnCondition | ParsedExpressionFilter | RawCondition | null | void;
}

/**
 * Visits the nested conditions within `query`.
 *
 * If the visitors return a new condition or expression, the returned expression
 * will replace the original one at that location in the expression.
 *
 * If the visitor returns null, the condition or expression will be removed from the tree.
 */
export function visitConditions(query: ParsedFindQuery, visitor: Visitor): void {
  const todo = [query];
  while (todo.length > 0) {
    const query = todo.pop()!;
    if (query.condition) visitFilter(query.condition, visitor);
    // Recurse into lateral subqueries (used by batching/preloading, not EXISTS rewrite)
    for (const table of query.tables) {
      if (table.join === "lateral") {
        todo.push(table.query);
      }
    }
    // Recurse into EXISTS subqueries so batching visitors can rewrite conditions inside them
    if (query.condition) {
      visitExistsSubqueries(query.condition, todo);
    }
  }
}

/** Finds ExistsCondition nodes in a condition tree and pushes their subqueries onto the todo list. */
function visitExistsSubqueries(condition: ParsedExpressionCondition, todo: ParsedFindQuery[]): void {
  if (condition.kind === "exp") {
    for (const c of condition.conditions) {
      visitExistsSubqueries(c, todo);
    }
  } else if (condition.kind === "exists") {
    todo.push(condition.subquery);
  }
}

export function visitFilter(pc: ParsedExpressionCondition, visitor: Visitor) {
  if (pc.kind === "exp") {
    const toRemove = new Set<number>();
    pc.conditions.forEach((c, i) => {
      if (c.kind === "column") {
        const result = visitor.visitCond(c);
        if (result === null) {
          toRemove.add(i);
        } else if (result) {
          pc.conditions[i] = result;
        }
      } else if (c.kind === "exp") {
        const result = visitor.visitExp?.(c);
        if (result === null) {
          toRemove.add(i);
          return;
        } else if (result) {
          pc.conditions[i] = result;
        }
        visitFilter(result ?? c, visitor);
      } else if (c.kind === "raw") {
        const result = visitor.visitRaw?.(c);
        if (result === null) {
          toRemove.add(i);
        } else if (result) {
          pc.conditions[i] = result;
        }
      } else if (c.kind === "exists") {
        // EXISTS conditions are visited via visitExistsSubqueries, not inline
      } else {
        assertNever(c);
      }
    });
    // do this after visiting the children, so we can do it in one pass and don't mess up the indices
    if (toRemove.size > 0) pc.conditions = pc.conditions.filter((_, i) => !toRemove.has(i));
  } else if (pc.kind === "column") {
    const result = visitor.visitCond(pc);
    if (result || result === null) {
      throw new Error("ParsedExpressionCondition overload not support mutating the condition");
    }
  } else if (pc.kind === "raw") {
    const result = visitor.visitRaw?.(pc);
    if (result || result === null) {
      throw new Error("ParsedExpressionCondition overload not support mutating the condition");
    }
  } else if (pc.kind === "exists") {
    // EXISTS conditions are handled at the query level
  } else {
    assertNever(pc);
  }
}

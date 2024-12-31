import { ColumnCondition, ParsedExpressionFilter, ParsedFindQuery, RawCondition } from "./QueryParser";

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
  function visit(ef: ParsedExpressionFilter) {
    ef.conditions.forEach((c, i) => {
      if (c.kind === "column") {
        const result = visitor.visitCond(c);
        if (result) {
          ef.conditions[i] = result;
        }
      } else if (c.kind === "exp") {
        const result = visitor.visitExp?.(c);
        if (result) ef.conditions[i] = result;
        visit(result ?? c);
      } else if (c.kind === "raw") {
        const result = visitor.visitRaw?.(c);
        if (result) {
          ef.conditions[i] = result;
        }
      } else {
        throw new Error(`Unsupported kind ${c}`);
      }
    });
  }
  if (query.condition) visit(query.condition);
  for (const table of query.tables) {
    // ...we probably need better recursion here?
    if (table.join === "lateral") {
      if (table.query.condition) {
        visit(table.query.condition);
      }
    }
  }
}

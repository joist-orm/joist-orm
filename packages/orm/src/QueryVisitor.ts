import { ColumnCondition, ParsedExpressionFilter, ParsedFindQuery } from "./QueryParser";

/** A generic visitor over the simple & complex conditions of a query. */
interface Visitor {
  visitExp?(c: ParsedExpressionFilter): ParsedExpressionFilter | void;
  visitCond(c: ColumnCondition): ColumnCondition | ParsedExpressionFilter | void;
}

/**
 * Visits the nested conditions within `query`.
 *
 * If the visitors return a new condition or expression,
 *
 * */
export function visitConditions(query: ParsedFindQuery, visitor: Visitor): void {
  function visit(ef: ParsedExpressionFilter) {
    ef.conditions.forEach((c, i) => {
      if ("cond" in c) {
        const result = visitor.visitCond(c);
        if (result) ef.conditions[i] = result;
      } else {
        const result = visitor.visitExp?.(c);
        if (result) ef.conditions[i] = result;
        visit(result ?? c);
      }
    });
  }
  if (query.condition) visit(query.condition);
}

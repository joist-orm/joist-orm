import type { EntityMetadata } from "src/EntityMetadata.ts";
import type { ParsedExpressionCondition } from "src/queries/parsedConditions.ts";
import type { SqlFragment } from "src/queries/sql/Expr.ts";
import type { ParsedCte, ParsedJoin, ParsedSource } from "src/queries/sql/query.ts";

/** A physical table occurrence. Its policy conditions do not retain an otherwise-unused join. */
export interface ParsedQueryTable {
  readonly table: string;
  readonly schema: string | undefined;
  readonly alias: string;
  readonly metadata: EntityMetadata | undefined;
  readonly columns: ReadonlySet<string>;
  readonly join: "primary" | "inner" | "left";
  /** Structured predicates are rendered into WHERE for the primary source and ON for joined sources. */
  readonly conditions: ParsedExpressionCondition[];
}

/** A resolved SELECT, before join pruning and SQL rendering. */
export interface ParsedSelectQuery {
  kind: "select";
  tables: ParsedQueryTable[];
  selects: SqlFragment[];
  /** Raw SQL cannot provide reliable table/column lineage. */
  hasRawSql: boolean;
  /** Present only when this SELECT hydrates an entity, rather than projecting values. */
  entityMetadata?: EntityMetadata;
  from: ParsedSource;
  joins: ParsedJoin[];
  ctes: ParsedCte[];
  where?: SqlFragment;
  having?: SqlFragment;
  groupBys: SqlFragment[];
  orderBys: SqlFragment[];
  distinct: boolean;
  limit?: number;
  offset?: number;
  pruneJoins: boolean;
  /** Alias of a recursive CTE's required self-reference, if this SELECT is its recursive term. */
  recursiveAlias?: string;
}

/** A set operation has operands, rather than a SELECT list or physical tables of its own. */
export interface ParsedSetQuery {
  kind: "set";
  operation: string;
  operands: { query: ParsedReadQuery; outerRefs: string[]; alignment?: { alias: string; columns: string[] } }[];
  ctes: ParsedCte[];
  orderBys: string[];
  limit?: number;
  offset?: number;
}

export type ParsedReadQuery = ParsedSelectQuery | ParsedSetQuery;

/** An immediate mutation and all reads used by its CTEs, assignments, predicates, and RETURNING. */
export interface ParsedExecuteQuery {
  kind: "insert" | "update" | "delete";
  target: { table: string; schema?: string; alias: string; metadata?: EntityMetadata };
  ctes: ParsedCte[];
  columns: string[];
  values?: SqlFragment[][];
  source?: { query: ParsedReadQuery; outerRefs: string[]; alias: string; columns: string[] };
  assignments: { column: string; value: SqlFragment }[];
  conditions: SqlFragment[];
  returning: SqlFragment[];
  hasRawSql: boolean;
}

/**
 * Visits the original SELECT occurrences in a statement, including reads inside expressions.
 *
 * Snapshot before invoking visitors so injected policy queries are not recursively authorized.
 * CTE definitions appear once; references (including recursive self-references) are not traversed.
 */
export function visitQuery(
  query: ParsedReadQuery | ParsedExecuteQuery,
  visitor: (query: ParsedSelectQuery) => void,
): void {
  const selects: ParsedSelectQuery[] = [];
  const seen = new Set<ParsedReadQuery | ParsedExecuteQuery>();

  /** Follows definitions and expression children, never a CTE's named references. */
  function collect(node: ParsedReadQuery | ParsedExecuteQuery): void {
    if (seen.has(node)) return;
    seen.add(node);
    if (node.kind === "select") selects.push(node);
    for (const cte of node.ctes) collect(cte.query);

    if (node.kind === "select") {
      collectExpression(node.from);
      for (const join of node.joins) {
        collectExpression(join.source);
        collectExpression(join.fullOn);
      }
      for (const expression of [...node.selects, ...node.groupBys, ...node.orderBys, node.where, node.having]) {
        collectExpression(expression);
      }
    } else if (node.kind === "set") {
      for (const operand of node.operands) collect(operand.query);
    } else {
      if (node.source) collect(node.source.query);
      for (const row of node.values ?? []) row.forEach(collectExpression);
      for (const assignment of node.assignments) collectExpression(assignment.value);
      node.conditions.forEach(collectExpression);
      node.returning.forEach(collectExpression);
    }
  }

  /** Resolved predicates and composed expressions retain their child-query references. */
  function collectExpression(expression: SqlFragment | undefined): void {
    if (!expression) return;
    if (expression.query) collect(expression.query);
    for (const part of expression.parts ?? []) {
      if (typeof part !== "string") collectExpression(part);
    }
    if (expression.condition) collectCondition(expression.condition);
  }

  /** Policy conditions on tables are intentionally separate from the application's expressions. */
  function collectCondition(condition: ParsedExpressionCondition): void {
    if (condition.kind === "exp") condition.conditions.forEach(collectCondition);
    else if (condition.kind === "raw") collectExpression(condition.fragment);
  }

  collect(query);
  selects.forEach(visitor);
}

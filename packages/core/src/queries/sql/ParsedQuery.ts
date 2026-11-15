import type { EntityMetadata } from "src/EntityMetadata.ts";
import { type ParsedSql, type ParsedSqlCondition, visitSql } from "src/queries/sql/ParsedSqlExpression.ts";
import type { ParsedCte, ParsedJoin, ParsedSource } from "src/queries/sql/query.ts";

/** A resolved SELECT, before join pruning and SQL rendering. */
export interface ParsedSelectQuery {
  kind: "select";
  selects: ParsedSql[];
  /** Present only when this SELECT hydrates an entity, rather than projecting values. */
  entityMetadata?: EntityMetadata;
  from: ParsedSource;
  joins: ParsedJoin[];
  ctes: ParsedCte[];
  where?: ParsedSql;
  having?: ParsedSql;
  groupBys: ParsedSql[];
  orderBys: ParsedSql[];
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
  operands: { query: ParsedReadQuery; alignment?: { alias: string; columns: string[] } }[];
  ctes: ParsedCte[];
  orderBys: string[];
  limit?: number;
  offset?: number;
}

/**
 * SQL statement lifecycle:
 *
 * 1. Application code creates reusable tables, expressions, predicates, and subqueries.
 * 2. It composes these into a statement passed to em.query or em.execute.
 * 3. Parsing resolves aliases and expressions into a ParsedReadQuery or ParsedExecuteQuery.
 *    The complete statement tree includes nested queries and ParsedSql expression nodes.
 * 4. beforeQuery or beforeExecute plugins inspect and modify that AST.
 * 5. Joist prunes unused joins/CTEs, renders SQL and bindings, and executes the statement.
 *
 * Each call parses a fresh AST, so plugin changes do not modify the application's reusable inputs.
 */
export type ParsedReadQuery = ParsedSelectQuery | ParsedSetQuery;

/** A mutation and all reads used by its CTEs, assignments, predicates, and RETURNING. */
export interface ParsedExecuteQuery {
  kind: "insert" | "update" | "delete";
  target: { table: string; schema?: string; alias: string; metadata?: EntityMetadata };
  ctes: ParsedCte[];
  columns: string[];
  values?: ParsedSql[][];
  source?: { query: ParsedReadQuery; alias: string; columns: string[] };
  assignments: { column: string; value: ParsedSql }[];
  conditions: ParsedSql[];
  returning: ParsedSql[];
}

/**
 * Visits the original SELECT occurrences in a statement, including reads inside expressions.
 *
 * Snapshot before invoking visitors so expressions added by a visitor do not extend its traversal.
 * CTE definitions appear once; references (including recursive self-references) are not traversed.
 */
export function visitQuery(
  query: ParsedReadQuery | ParsedExecuteQuery,
  visitor: (query: ParsedSelectQuery) => void,
): void {
  const selects: ParsedSelectQuery[] = [];
  walkQuery(
    query,
    (select) => selects.push(select),
    () => {},
  );
  selects.forEach(visitor);
}

export type QueryExpressionClause = "select" | "on" | "where" | "having" | "groupBy" | "orderBy";

/** The SELECT and alias scope containing an expression, including enclosing correlated sources. */
export interface QueryExpressionContext {
  select: ParsedSelectQuery;
  clause: QueryExpressionClause;
  /** Finds the FROM/JOIN source for an alias in this SELECT or an enclosing SELECT; local aliases take precedence. */
  resolveSource(alias: string): ParsedSource | undefined;
}

/**
 * Visits expressions and predicates throughout a read statement with their SELECT and source scope.
 *
 * Nested queries receive their own clause context. CTE bodies see enclosing sources, not the
 * defining SELECT's sources. Snapshot before callbacks so visitor-added expressions are not visited.
 */
export function visitQueryExpressions(
  query: ParsedReadQuery,
  visitor: (node: ParsedSql | ParsedSqlCondition, context: QueryExpressionContext) => void,
): void {
  const expressions: { node: ParsedSql | ParsedSqlCondition; context: QueryExpressionContext }[] = [];
  walkQuery(
    query,
    () => {},
    (node, context) => expressions.push({ node, context }),
  );
  for (const entry of expressions) visitor(entry.node, entry.context);
}

/**
 * Finds source aliases and CTE names referenced outside this query's scope.
 *
 * I.e. FROM totals depends on an enclosing WITH totals even when the SELECT only uses count(*).
 */
export function queryRefs(query: ParsedReadQuery): readonly string[] {
  const refs = new Set<string>();
  walkQuery(
    query,
    () => {},
    (node, context) => {
      let aliases: readonly string[] = [];
      switch (node.kind) {
        case "column":
        case "star":
          aliases = [node.alias];
          break;
        case "raw":
          if ("aliases" in node) aliases = node.aliases;
          break;
        case "exists":
          aliases = node.outerAliases;
          break;
      }
      for (const alias of aliases) {
        if (!context.resolveSource(alias)) refs.add(alias);
      }
    },
    (source, resolveCte) => {
      if (source.kind === "cte" && !resolveCte(source.cte)) refs.add(source.cte);
    },
  );
  return [...refs];
}

/**
 * Walks nested queries, sources, and expressions, resolving source aliases and CTE definitions for callbacks.
 *
 * I.e. when a book subquery references an enclosing author's a.minimum_price column,
 * context.resolveSource("a") returns the outer SELECT's author source.
 */
function walkQuery(
  query: ParsedReadQuery | ParsedExecuteQuery,
  onSelect: (select: ParsedSelectQuery) => void,
  onExpression: (node: ParsedSql | ParsedSqlCondition, context: QueryExpressionContext) => void,
  onSource?: (source: ParsedSource, resolveCte: (name: string) => ParsedCte | undefined) => void,
): void {
  const seen = new Set<ParsedReadQuery | ParsedExecuteQuery>();
  collect(query, new Map(), new Map());

  /** Follows definitions and expression children, never a CTE's named references. */
  function collect(
    node: ParsedReadQuery | ParsedExecuteQuery,
    parent: ReadonlyMap<string, ParsedSource>,
    parentCtes: ReadonlyMap<string, ParsedCte>,
  ): void {
    if (seen.has(node)) return;
    seen.add(node);
    if (node.kind === "select") onSelect(node);
    const ctes = new Map(parentCtes);
    for (const cte of node.ctes) ctes.set(cte.alias, cte);
    for (const cte of node.ctes) collect(cte.query, parent, ctes);

    if (node.kind === "select") {
      const select = node;
      const sources = new Map(parent);
      for (const source of [node.from, ...node.joins.map((join) => join.source)]) {
        sources.set(source.alias, source);
        onSource?.(source, (name) => ctes.get(name));
      }
      if (node.from.kind === "query") collect(node.from.query, sources, ctes);
      for (const join of node.joins) {
        if (join.source.kind === "query") collect(join.source.query, sources, ctes);
        visit(join.on, "on");
      }
      for (const expression of node.selects) visit(expression, "select");
      for (const expression of node.groupBys) visit(expression, "groupBy");
      for (const expression of node.orderBys) visit(expression, "orderBy");
      visit(node.where, "where");
      visit(node.having, "having");

      /** Keeps clause context local when an expression contains a nested SELECT. */
      function visit(expression: ParsedSql | undefined, clause: QueryExpressionClause): void {
        collectExpression(expression, sources, ctes, {
          select,
          clause,
          resolveSource(alias) {
            return sources.get(alias);
          },
        });
      }
    } else if (node.kind === "set") {
      for (const operand of node.operands) collect(operand.query, parent, ctes);
    } else {
      if (node.source) collect(node.source.query, parent, ctes);
      for (const row of node.values ?? []) {
        for (const expression of row) collectExpression(expression, parent, ctes);
      }
      for (const assignment of node.assignments) collectExpression(assignment.value, parent, ctes);
      for (const expression of [...node.conditions, ...node.returning]) collectExpression(expression, parent, ctes);
    }
  }

  /** Resolved predicates and composed expressions retain their child-query references. */
  function collectExpression(
    expression: ParsedSql | undefined,
    sources: ReadonlyMap<string, ParsedSource>,
    ctes: ReadonlyMap<string, ParsedCte>,
    context?: QueryExpressionContext,
  ): void {
    if (!expression) return;
    visitSql(expression, (node) => {
      if (context) onExpression(node, context);
      if (node.kind === "query") collect(node.query, sources, ctes);
    });
  }
}

import { buildRawQuery } from "src/queries/find/buildFindQuery.ts";
import type { ParsedExpressionCondition, ParsedExpressionFilter } from "src/queries/parsedConditions.ts";
import { buildWhereClause } from "src/queries/renderConditions.ts";
import { kq, safeKq } from "src/queries/sql/keywords.ts";
import {
  type ParsedExecuteQuery,
  type ParsedReadQuery,
  type ParsedSelectQuery,
  type ParsedSetQuery,
  queryRefs,
} from "src/queries/sql/ParsedQuery.ts";
import {
  type ParsedSql,
  type ParsedSqlCondition,
  joinSql,
  sourceRefs,
  sqlRefs,
} from "src/queries/sql/ParsedSqlExpression.ts";
import type { ParsedCte, ParsedJoin, ParsedSource } from "src/queries/sql/query.ts";
import { tableSqlName } from "src/queries/sql/Tables.ts";
import { assertNever, fail } from "src/utils.ts";

/** Rendered SQL and its positional bindings. */
export interface SqlFragment {
  sql: string;
  bindings: unknown[];
}

/** Prunes unused joins/CTEs, validates joins, and renders a read statement. */
export function renderQuery(query: ParsedReadQuery): SqlFragment {
  return renderSql({ kind: "query", query });
}

/** Prunes unused joins/CTEs, validates joins, and renders a read or mutation statement. */
export function renderStatement(query: ParsedReadQuery | ParsedExecuteQuery): SqlFragment {
  return query.kind === "select" || query.kind === "set" ? renderQuery(query) : renderSql(buildStatementSql(query));
}

/** Renders an expression and its bindings, pruning and validating any embedded queries. */
export function renderSql(node: ParsedSql): SqlFragment {
  let result: SqlFragment;
  switch (node.kind) {
    case "column":
      // Both identifiers can be user-provided: a subquery's `as` name or an `a.column(...)` argument.
      result = { sql: `${safeKq(node.alias)}.${safeKq(node.column)}`, bindings: [] };
      break;
    case "star":
      result = { sql: `${safeKq(node.alias)}.*`, bindings: [] };
      break;
    case "joined":
    case "raw": {
      const parts = node.parts.map((part) =>
        typeof part === "string"
          ? { sql: part, bindings: [] }
          : "kind" in part
            ? renderSql(part)
            : { sql: "?", bindings: [part.value] },
      );
      result = {
        sql: parts.map((part) => part.sql).join(""),
        bindings: parts.flatMap((part) => part.bindings),
      };
      break;
    }
    case "query":
      result = renderSql(buildQuerySql(node.query));
      break;
    case "condition": {
      const condition = renderCondition(node.condition) as ParsedExpressionFilter;
      const rendered = buildWhereClause(condition, node.topLevel, (query) => buildRawQuery(query, {}));
      result = { sql: rendered?.[0] ?? "", bindings: rendered?.[1] ?? [] };
      break;
    }
    default:
      return assertNever(node);
  }

  return result;
}

/** Converts expression leaves to rendered predicates for the shared condition renderer. */
function renderCondition(condition: ParsedSqlCondition): ParsedExpressionCondition {
  if (condition.kind === "exp") {
    return { ...condition, conditions: condition.conditions.map((child) => renderCondition(child)) };
  }
  if (condition.kind === "expression") {
    const rendered = renderSql(condition.expression);
    return {
      kind: "raw",
      condition: rendered.sql,
      bindings: rendered.bindings,
      // Pruning has finished; the shared condition renderer only needs SQL and bindings.
      aliases: [],
      pruneable: false,
    };
  }
  return condition;
}

/** Prunes unused joins/CTEs, validates joins, and builds the SELECT SQL. */
function buildQuerySql(query: ParsedReadQuery): ParsedSql {
  if (query.kind === "set") return renderSetQuery(query);
  const { from, selects, groupBys, orderBys, where, having } = query;
  const { joins: kept, ctes: keptCtes } = pruneJoins(
    query,
    from,
    query.joins,
    query.ctes,
    [...selects, ...groupBys, ...orderBys, where, having].filter((expression) => expression !== undefined),
  );
  // Joins emit in declaration order, so an ON may only reference sources declared before it; a forward
  // reference would reach PG as invalid SQL ("missing FROM-clause entry"). Reordering is not offered:
  // it is not semantics-preserving once INNER and LEFT joins mix, and the caller's fix is trivial.
  const laterAliases = new Set(kept.map((j) => j.source.alias));
  for (const j of kept) {
    if (!j.on) {
      fail(
        `Join ${describeSource(j.source)} has no ON condition left (they all pruned), but the query still references it`,
      );
    }
    laterAliases.delete(j.source.alias);
    const forward = sqlRefs(j.on).find((r) => laterAliases.has(r));
    if (forward) {
      fail(
        `Join ${describeSource(j.source)} references '${forward}', which is joined later; move that join earlier in the join array`,
      );
    }
  }

  // Assemble the SELECT after pruning and join validation.
  const out: (string | ParsedSql)[] = [];
  // WITH leads the statement, so its bindings must be pushed before the SELECT's.
  if (keptCtes.length > 0) out.push(withFragment(keptCtes));
  out.push(`SELECT ${query.distinct ? "DISTINCT " : ""}`);
  out.push(joinSql(selects, ", "));
  out.push(joinSql([" FROM ", sourceSql(from)]));
  for (const j of kept) {
    const keyword = j.kind === "inner" ? "JOIN" : "LEFT OUTER JOIN";
    out.push(joinSql([` ${keyword} `, sourceSql(j.source), " ON ", j.on!]));
  }
  if (where) out.push(joinSql([" WHERE ", where]));
  if (groupBys.length > 0) out.push(joinSql([" GROUP BY ", joinSql(groupBys, ", ")]));
  if (having) out.push(joinSql([" HAVING ", having]));
  if (orderBys.length > 0) out.push(joinSql([" ORDER BY ", joinSql(orderBys, ", ")]));
  if (query.limit !== undefined) out.push(joinSql([" LIMIT ", { value: query.limit }]));
  if (query.offset !== undefined) out.push(joinSql([" OFFSET ", { value: query.offset }]));
  return joinSql(out);
}

/** Builds INSERT, UPDATE, or DELETE SQL from the rewritten AST. */
function buildStatementSql(query: ParsedExecuteQuery): ParsedSql {
  const operation = query.kind === "delete" ? "DELETE FROM" : query.kind === "insert" ? "INSERT INTO" : "UPDATE";
  const target = tableSqlName({ tableName: query.target.table, schema: query.target.schema });
  const parts: (string | ParsedSql)[] = [`${operation} ${target} AS ${kq(query.target.alias)}`];
  if (query.kind === "insert") {
    parts.push(` (${query.columns.map(kq).join(", ")})`);
    if (query.values) {
      const rows = query.values.map((row) => joinSql(["(", joinSql(row, ", "), ")"]));
      parts.push(" VALUES ", joinSql(rows, ", "));
    } else {
      const source = query.source!;
      const alias = safeKq(source.alias);
      const columns = source.columns.map((key) => `${alias}.${safeKq(key)}`).join(", ");
      parts.push(` SELECT ${columns} FROM (`, { kind: "query", query: source.query }, `) AS ${alias}`);
    }
  } else if (query.kind === "update") {
    const assignments = query.assignments.map((entry) => joinSql([`${kq(entry.column)} = `, entry.value]));
    parts.push(" SET ", joinSql(assignments, ", "));
  }

  if (query.conditions.length) {
    const conditions = query.conditions.map((condition) => joinSql(["(", condition, ")"]));
    parts.push(" WHERE ", joinSql(conditions, " AND "));
  }
  if (query.returning.length) parts.push(" RETURNING ", joinSql(query.returning, ", "));
  const body = joinSql(parts);
  const ctes = pruneCtes(query.ctes, new Set(sqlRefs(body)));
  return ctes.length ? joinSql([withFragment(ctes), body]) : body;
}

/**
 * Pruning: em.find's paradigm, on a flat join list.
 *
 * A condition given `undefined` was already dropped by `ConditionBuilder`. Now a join that nothing
 * references anymore drops with it: a join is required if the source, a select, a surviving condition,
 * a group-by, an order-by, or another required join's ON references it, or if it is pinned with
 * `keep: true`. Marking follows ON dependencies transitively, exactly like `pruneUnusedJoins`'s
 * `DependencyTracker`.
 *
 * em.find's joins almost never filter rows by themselves, so pruning them is semantics-preserving. An
 * explicit `{ inner: b, on }` here does filter rows, so pruning it when unreferenced drops that filter;
 * that matches `{ books: { title: undefined } }` in em.find and is deliberate. `keep: true` pins it, and
 * a pure existence filter is better written as `a.id.in(query({ ... }))`, which is never `undefined`.
 *
 * CTEs prune on the same rule and through the same dependency map: a `with` entry nothing reads
 * anymore drops with the join that read it, and a CTE read only by another CTE survives with it.
 * A CTE joined into the query shares its alias with that join, so their dependencies are merged.
 *
 * The one join that never prunes is a recursive term's reference to its own CTE: PostgreSQL requires
 * it, so it is not the caller's optional filter (see `Ctx.recursiveSelf`).
 */
function pruneJoins(
  q: ParsedSelectQuery,
  from: ParsedSource,
  joins: ParsedJoin[],
  ctes: ParsedCte[],
  used: ParsedSql[],
): { joins: ParsedJoin[]; ctes: ParsedCte[] } {
  if (q.pruneJoins === false) return { joins, ctes };
  const deps = new Map<string, string[]>();
  function addDeps(alias: string, refs: readonly string[]): void {
    const own = refs.filter((r) => r !== alias);
    const existing = deps.get(alias);
    if (existing) existing.push(...own);
    else deps.set(alias, own);
  }
  for (const j of joins) {
    addDeps(j.source.alias, [...(j.on ? sqlRefs(j.on) : []), ...sourceRefs(j.source)]);
  }
  for (const c of ctes) addDeps(c.alias, queryRefs(c.query));
  const required = new Set<string>();
  function markRequired(alias: string): void {
    if (required.has(alias)) return;
    required.add(alias);
    for (const dep of deps.get(alias) ?? []) markRequired(dep);
  }
  markRequired(from.alias);
  for (const ref of sourceRefs(from)) markRequired(ref);
  for (const r of used.flatMap(sqlRefs)) markRequired(r);
  for (const j of joins) if (j.keep) markRequired(j.source.alias);
  // A recursive term must keep its reference to its own CTE; PostgreSQL rejects a term without one,
  // and pruning it would quietly turn the recursion into a plain select over the base term's table.
  if (q.recursiveAlias) markRequired(q.recursiveAlias);
  return {
    joins: joins.filter((j) => required.has(j.source.alias)),
    ctes: ctes.filter((c) => required.has(c.alias)),
  };
}

/**
 * Drops the CTEs that nothing reads, given the aliases the rest of the statement referenced.
 *
 * A CTE can only read earlier siblings, so going last to first means every CTE that could read this one
 * was already visited, and its own reads are already in `referenced`. That makes one pass enough; first
 * to last would have to repeat until the set stopped growing. `unshift` restores WITH order.
 */
function pruneCtes(ctes: ParsedCte[], referenced: Set<string>): ParsedCte[] {
  const kept: ParsedCte[] = [];
  for (let i = ctes.length - 1; i >= 0; i--) {
    const cte = ctes[i];
    if (!referenced.has(cte.alias)) continue;
    for (const ref of queryRefs(cte.query)) referenced.add(ref);
    kept.unshift(cte);
  }
  return kept;
}

/**
 * Renders `WITH a AS (...), b AS (...) `, whose bindings lead the statement, as their SQL does.
 *
 * One recursive CTE makes the whole clause `WITH RECURSIVE`, PostgreSQL's rule: the keyword is on the
 * clause, not on the entry that needs it, and it does not force the other entries to be recursive.
 */
function withFragment(ctes: ParsedCte[]): ParsedSql {
  const recursive = ctes.some((c) => c.recursive) ? " RECURSIVE" : "";
  const bodies = ctes.map((c) => joinSql([`${safeKq(c.alias)} AS (`, { kind: "query", query: c.query }, ")"]));
  return joinSql([`WITH${recursive} `, joinSql(bodies, ", "), " "]);
}

/** Composes set operands after their SELECT nodes have been rewritten. */
function renderSetQuery(query: ParsedSetQuery): ParsedSql {
  let body: ParsedSql | undefined;
  for (const operand of query.operands) {
    let branch: ParsedSql = { kind: "query", query: operand.query };
    if (operand.alignment) {
      const alias = safeKq(operand.alignment.alias);
      const columns = operand.alignment.columns.map((key) => `${alias}.${safeKq(key)} AS ${safeKq(key)}`).join(", ");
      branch = joinSql([`SELECT ${columns} FROM (`, branch, `) AS ${alias}`]);
    }
    body = body ? joinSql(["(", body, `) ${query.operation} (`, branch, ")"]) : branch;
  }
  const ctes = pruneCtes(query.ctes, new Set(query.operands.flatMap((operand) => queryRefs(operand.query))));
  const parts: (string | ParsedSql)[] = ctes.length ? [withFragment(ctes), body!] : [body!];
  if (query.orderBys.length) parts.push(` ORDER BY ${query.orderBys.join(", ")}`);
  if (query.limit !== undefined) parts.push(joinSql([" LIMIT ", { value: query.limit }]));
  if (query.offset !== undefined) parts.push(joinSql([" OFFSET ", { value: query.offset }]));
  return joinSql(parts);
}

/** Builds source syntax after plugins have rewritten its table, CTE, or query. */
function sourceSql(source: ParsedSource): ParsedSql {
  switch (source.kind) {
    case "table":
      return joinSql([
        `${tableSqlName({ tableName: source.table, schema: source.schema })} AS ${safeKq(source.alias)}`,
      ]);
    case "cte":
      return joinSql([safeKq(source.cte), ...(source.cte === source.alias ? [] : [` AS ${safeKq(source.alias)}`])]);
    case "query":
      return joinSql(["(", { kind: "query", query: source.query }, `) AS ${safeKq(source.alias)}`]);
    default:
      return assertNever(source);
  }
}

/** Names the rewritten source in join-validation errors. */
function describeSource(source: ParsedSource): string {
  switch (source.kind) {
    case "table":
      return `table ${source.schema ? `${source.schema}.` : ""}${source.table} AS ${source.alias}`;
    case "cte":
      return `CTE ${source.cte} AS ${source.alias}`;
    case "query":
      return `subquery AS ${source.alias}`;
    default:
      return assertNever(source);
  }
}

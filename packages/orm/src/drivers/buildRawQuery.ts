import { ParsedFindQuery, ParsedTable } from "../QueryParser";
import { kq, kqDot } from "../keywords";
import { assertNever, cleanSql } from "../utils";
import { buildWhereClause } from "./buildUtils";

/**
 * Transforms `ParsedFindQuery` into a raw SQL string.
 *
 * In theory this should be implemented within each Driver, but the logic will be largely
 * the same for different dbs.
 */
export function buildRawQuery(
  parsed: ParsedFindQuery,
  settings: { limit?: number; offset?: number },
): { sql: string; bindings: readonly any[] } {
  const { limit, offset } = settings;

  const primary = parsed.tables.find((t) => t.join === "primary")!;

  // If we're doing o2m joins, add a `DISTINCT` clause to avoid duplicates
  const needsDistinct =
    parsed.tables.some((t) => t.join === "outer" && t.distinct !== false) &&
    // If this is a `findCount`, it will rewrite the `select` to have its own distinct
    !parsed.selects.find((s) => typeof s === "string" && s.startsWith("count("));

  let sql = "";
  const bindings: any[] = [];

  if (parsed.cte) {
    sql += cleanSql(parsed.cte.sql) + " ";
    bindings.push(...parsed.cte.bindings);
  }

  sql += "SELECT ";
  parsed.selects.forEach((s, i) => {
    const maybeDistinct = i === 0 && needsDistinct ? buildDistinctOn(parsed, primary) : "";
    const maybeComma = i === parsed.selects.length - 1 ? "" : ", ";
    if (typeof s === "string") {
      sql += maybeDistinct + s + maybeComma;
    } else {
      sql += maybeDistinct + s.sql + maybeComma;
      bindings.push(...s.bindings);
    }
  });

  // If we're doing "select distinct" for o2m joins, then all order bys must be selects
  if (needsDistinct && parsed.orderBys.length > 0) {
    for (const { alias, column } of parsed.orderBys) {
      sql += `, ${kqDot(alias, column)}`;
    }
  }

  // Make sure the primary is first
  sql += ` FROM ${as(primary)}`;

  // Then the joins
  for (const t of parsed.tables) {
    if (t.join === "inner") {
      sql += ` JOIN ${as(t)} ON ${t.col1} = ${t.col2}`;
    } else if (t.join === "outer") {
      sql += ` LEFT OUTER JOIN ${as(t)} ON ${t.col1} = ${t.col2}`;
    } else if (t.join === "primary") {
      // handled above
    } else if (t.join === "lateral") {
      const { sql: subQ, bindings: subB } = buildRawQuery(t.query, {});
      sql += ` CROSS JOIN LATERAL (${subQ}) AS ${kq(t.alias)}`;
      bindings.push(...subB);
    } else if (t.join === "cross") {
      sql += ` CROSS JOIN ${as(t)}`;
    } else {
      assertNever(t.join);
    }
  }

  if (parsed.condition) {
    const where = buildWhereClause(parsed.condition, true);
    if (where) {
      sql += " WHERE " + where[0];
      bindings.push(...where[1]);
    }
  }

  if (parsed.groupBys && parsed.groupBys.length > 0) {
    sql += " GROUP BY " + parsed.groupBys.map((ob) => kqDot(ob.alias, ob.column)).join(", ");
  }

  if (parsed.orderBys.length > 0) {
    sql += " ORDER BY " + parsed.orderBys.map((ob) => kqDot(ob.alias, ob.column) + " " + ob.order).join(", ");
  }

  if (limit) {
    sql += ` LIMIT ?`;
    bindings.push(limit);
  }
  if (offset) {
    sql += ` OFFSET ?`;
    bindings.push(offset);
  }

  return { sql, bindings };
}

function buildDistinctOn(parsed: ParsedFindQuery, primary: ParsedTable): string {
  const columns = [
    // If we have an order by, it needs to be included in the DISTINCT ON
    ...parsed.orderBys.map((ob) => kqDot(ob.alias, ob.column)),
    kqDot(primary.alias, "id"),
  ];
  return `DISTINCT ON (${columns.join(", ")}) `;
}

const as = (t: ParsedTable) => `${kq(t.table)} AS ${kq(t.alias)}`;

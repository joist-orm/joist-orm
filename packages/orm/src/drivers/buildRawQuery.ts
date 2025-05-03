import { kq, kqDot } from "../keywords";
import { getTables, ParsedFindQuery, ParsedTable } from "../QueryParser";
import { assertNever } from "../utils";
import { buildWhereClause, deepFindCtes } from "./buildUtils";

/**
 * Transforms `ParsedFindQuery` into a raw SQL string.
 *
 * In theory this should be implemented within each Driver, but the logic will be largely
 * the same for different dbs.
 */
export function buildRawQuery(
  parsed: ParsedFindQuery,
  settings: { limit?: number; offset?: number; isTopLevel?: boolean },
): { sql: string; bindings: readonly any[] } {
  const { limit, offset } = settings;

  let sql = "";
  const bindings: any[] = [];

  const isTopLevel = settings.isTopLevel ?? true;

  if (parsed.cte) {
    sql += parsed.cte.sql + " ";
    bindings.push(...parsed.cte.bindings);
  }

  // Pull all CTEs up to the top
  if (isTopLevel) {
    let i = 0;
    for (const cte of deepFindCtes(parsed)) {
      const commaOrWith = i === 0 ? "WITH" : ",";
      const { sql: subQ, bindings: subB } = buildRawQuery(cte.query, { isTopLevel: false });
      sql += `${commaOrWith} ${kq(cte.alias)} AS (${subQ}) `;
      bindings.push(...subB);
      i++;
    }
  }

  sql += "SELECT ";
  parsed.selects.forEach((s, i) => {
    const maybeComma = i === parsed.selects.length - 1 ? "" : ", ";
    if (typeof s === "string") {
      sql += s + maybeComma;
    } else {
      sql += s.sql + maybeComma;
      bindings.push(...s.bindings);
    }
  });

  // Make sure the primary is first
  const [primary] = getTables(parsed);
  sql += ` FROM ${as(primary)}`;

  // Then the joins
  for (const t of parsed.tables) {
    if (t.join === "primary") {
      // handled above
    } else if (t.join === "inner") {
      sql += ` JOIN ${as(t)} ON ${t.col1} = ${t.col2}`;
    } else if (t.join === "outer") {
      sql += ` LEFT OUTER JOIN ${as(t)} ON ${t.col1} = ${t.col2}`;
    } else if (t.join === "cte") {
      sql += `${t.outer ? " LEFT OUTER" : ""} JOIN ${t.alias} ON ${t.col1} = ${t.col2}`;
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

  if (parsed.having) {
    const where = buildWhereClause(parsed.having, true);
    if (where) {
      sql += " HAVING " + where[0];
      bindings.push(...where[1]);
    }
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

const as = (t: ParsedTable) => `${kq(t.table)} AS ${kq(t.alias)}`;

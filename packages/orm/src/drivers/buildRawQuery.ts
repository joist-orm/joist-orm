import { ParsedFindQuery, ParsedTable } from "../QueryParser";
import { kq, kqDot } from "../keywords";
import { assertNever } from "../utils";
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

  let sql = "";
  const bindings: any[] = [];

  if (parsed.cte) {
    sql += parsed.cte.sql + " ";
    bindings.push(...parsed.cte.bindings);
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
  const primary = parsed.tables.find((t) => t.join === "primary")!;
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

  if (parsed.lateralJoins) {
    sql += " " + parsed.lateralJoins.joins.join("\n");
    bindings.push(...parsed.lateralJoins.bindings);
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

const as = (t: ParsedTable) => `${kq(t.table)} AS ${kq(t.alias)}`;

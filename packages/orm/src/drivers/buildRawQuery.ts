import { Knex } from "knex";
import { ParsedFindQuery, ParsedTable } from "../QueryParser";
import { kq, kqDot } from "../keywords";
import { assertNever } from "../utils";
import { buildWhereClause } from "./buildUtils";
import QueryBuilder = Knex.QueryBuilder;

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

  // If we're doing o2m joins, add a `DISTINCT` clause to avoid duplicates
  const needsDistinct = parsed.tables.some((t) => t.join === "outer" && t.distinct !== false);

  let sql = "";
  const bindings: any[] = [];

  if (parsed.cte) {
    sql += parsed.cte.sql + " ";
    bindings.push(...parsed.cte.bindings);
  }

  sql += "SELECT ";
  parsed.selects.forEach((s, i) => {
    const maybeDistinct = i === 0 && needsDistinct ? "DISTINCT " : "";
    const maybeComma = i === parsed.selects.length - 1 ? "" : ", ";
    sql += maybeDistinct + s + maybeComma;
  });

  // Make sure the primary is first
  const primary = parsed.tables.find((t) => t.join === "primary")!;
  sql += ` FROM ${as(primary)}`;
  // Then the joins
  for (const t of parsed.tables) {
    switch (t.join) {
      case "inner":
        sql += ` JOIN ${as(t)} ON ${t.col1} = ${t.col2}`;
        break;
      case "outer":
        sql += ` LEFT OUTER JOIN ${as(t)} ON ${t.col1} = ${t.col2}`;
        break;
      case "primary":
        // ignore
        break;
      default:
        assertNever(t);
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

  // If we're doing "select distinct" for o2m joins, then all order bys must be selects
  // if (needsDistinct) {
  //   query.select(`${alias}.${column}`);
  // }
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

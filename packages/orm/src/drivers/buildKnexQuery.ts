import { Knex } from "knex";
import { ParsedFindQuery, ParsedTable } from "../QueryParser";
import { kq, kqDot } from "../keywords";
import { assertNever } from "../utils";
import { buildWhereClause } from "./buildUtils";
import QueryBuilder = Knex.QueryBuilder;

/**
 * Transforms `ParsedFindQuery` into a Knex query.
 *
 * In theory this should be implemented within each Driver, because it's generally
 * a private API, but:
 *
 * a) Multiple drivers will likely be based on Knex, and
 * b) We've already leaked the `QueryBuilder.ts` `buildQuery` API for letting Joist
 * do the boilerplate joins/conditions, and then letting the user had more as needed.
 */
export function buildKnexQuery(
  knex: Knex,
  parsed: ParsedFindQuery,
  settings: { limit?: number; offset?: number },
): QueryBuilder<{}, unknown[]> {
  const { limit, offset } = settings;

  // If we're doing o2m joins, add a `DISTINCT` clause to avoid duplicates
  const needsDistinct = parsed.tables.some((t) => t.join === "outer" && t.distinct !== false);

  // We need the `knex` param to call `knex.raw`
  const asRaw = (t: ParsedTable) => knex.raw(`${kq(t.table)} as ${kq(t.alias)}`);

  const primary = parsed.tables.find((t) => t.join === "primary")!;

  let query: Knex.QueryBuilder<any, any> = knex.from(asRaw(primary));

  parsed.selects.forEach((s, i) => {
    const maybeDistinct = i === 0 && needsDistinct ? "distinct " : "";
    query.select(knex.raw(`${maybeDistinct}${s}`));
  });

  parsed.tables.forEach((t) => {
    switch (t.join) {
      case "inner":
        query.join(asRaw(t), knex.raw(t.col1) as any, knex.raw(t.col2));
        break;
      case "outer":
        query.leftOuterJoin(asRaw(t), knex.raw(t.col1) as any, knex.raw(t.col2));
        break;
      case "primary":
        // ignore
        break;
      case "lateral":
        throw new Error("Lateral joins are not implemented in buildKnexQuery yet");
      default:
        assertNever(t);
    }
  });

  if (parsed.lateralJoins) {
    query.joinRaw(parsed.lateralJoins.joins.join("\n"), parsed.lateralJoins.bindings);
  }

  if (parsed.condition) {
    const where = buildWhereClause(parsed.condition, true);
    if (where) {
      const [sql, bindings] = where;
      query.whereRaw(sql, bindings);
    }
  }

  parsed.orderBys &&
    parsed.orderBys.forEach(({ alias, column, order }) => {
      // If we're doing "select distinct" for o2m joins, then all order bys must be selects
      if (needsDistinct) {
        query.select(knex.raw(kqDot(alias, column)));
      }
      query.orderBy(knex.raw(kqDot(alias, column)) as any, order);
    });

  if (limit) query.limit(limit);
  if (offset) query.offset(offset);

  return query;
}

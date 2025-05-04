import { internals, kq, kqDot, ParsedFindQuery, ParsedTable } from "joist-orm";
import { Knex } from "knex";
import { assertNever } from "./utils";
import QueryBuilder = Knex.QueryBuilder;

/** Transforms Joist's internal `ParsedFindQuery` AST into a Knex query builder. */
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
    if (typeof s === "string") {
      query.select(knex.raw(`${maybeDistinct}${s}`));
    } else {
      query.select(knex.raw(`${maybeDistinct}${s.sql}`, s.bindings));
    }
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
        const { sql, bindings } = buildKnexQuery(knex, t.query, {}).toSQL();
        query.crossJoin(knex.raw(`lateral (${sql}) as ${kq(t.alias)}`, bindings));
        break;
      case "cross":
        query.crossJoin(asRaw(t));
        break;
      default:
        assertNever(t);
    }
  });

  if (parsed.condition) {
    const where = internals.buildWhereClause(parsed.condition, true);
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

  parsed.groupBys &&
    parsed.groupBys.forEach(({ alias, column }) => {
      query.groupByRaw(kqDot(alias, column));
    });

  if (limit) query.limit(limit);
  if (offset) query.offset(offset);

  return query;
}

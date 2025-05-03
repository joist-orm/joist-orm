import { CteJoinTable, getTables, internals, kq, kqDot, ParsedFindQuery, ParsedTable } from "joist-orm";
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

  // We need the `knex` param to call `knex.raw`
  const asRaw = (t: ParsedTable) => knex.raw(`${kq(t.table)} as ${kq(t.alias)}`);

  const primary = parsed.tables.find((t) => t.join === "primary")!;

  let query: Knex.QueryBuilder = knex.from(asRaw(primary));

  parsed.selects.forEach((s) => {
    if (typeof s === "string") {
      query.select(knex.raw(s));
    } else {
      query.select(knex.raw(s.sql, s.bindings));
    }
  });

  for (const cte of deepFindCtes(parsed)) {
    const { sql, bindings } = buildKnexQuery(knex, cte.query, {}).toSQL();
    query.with(cte.alias, knex.raw(sql, bindings));
  }

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
      case "cte":
        query.join(asRaw(t), knex.raw(t.col1) as any, knex.raw(t.col2));
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

function deepFindCtes(query: ParsedFindQuery): CteJoinTable[] {
  const all: CteJoinTable[] = [];
  const todo = getTables(query)[4];
  while (todo.length > 0) {
    const cte = todo.pop()!;
    all.push(cte);
    todo.push(...getTables(cte.query)[4]);
  }
  all.reverse();
  return all;
}

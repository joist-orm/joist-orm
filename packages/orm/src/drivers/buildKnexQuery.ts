import { Knex } from "knex";
import { opToFn } from "../EntityGraphQLFilter";
import { isDefined } from "../EntityManager";
import { ColumnCondition, ParsedExpressionFilter, ParsedFindQuery, ParsedTable } from "../QueryParser";
import { kq, kqDot } from "../keywords";
import { assertNever, fail } from "../utils";
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
        query.select(`${alias}.${column}`);
      }
      query.orderBy(knex.raw(kqDot(alias, column)) as any, order);
    });

  if (limit) {
    query.limit(limit);
  }

  if (offset) {
    query.offset(offset);
  }

  return query;
}

/** Returns a tuple of `["cond AND (cond OR cond)", bindings]`. */
function buildWhereClause(exp: ParsedExpressionFilter, topLevel = false): [string, any[]] | undefined {
  const tuples = exp.conditions
    .map((c) => {
      if ("op" in c) {
        return buildWhereClause(c);
      } else {
        return buildCondition(c);
      }
    })
    .filter(isDefined);
  // If we don't have any conditions to combine, just return undefined;
  if (tuples.length === 0) {
    return undefined;
  }
  let sql = tuples.map(([sql]) => sql).join(` ${exp.op} `);
  if (!topLevel) sql = `(${sql})`;
  return [sql, tuples.flatMap(([, bindings]) => bindings)];
}

/** Returns a tuple of `["column op ?"`, bindings]`. */
function buildCondition(cc: ColumnCondition): [string, any[]] {
  const { alias, column, cond } = cc;
  const columnName = kqDot(alias, column);
  switch (cond.kind) {
    case "eq":
    case "ne":
    case "gte":
    case "gt":
    case "lte":
    case "lt":
    case "like":
    case "nlike":
    case "ilike":
    case "nilike":
    case "contains":
    case "containedBy":
    case "overlaps":
      const fn = opToFn[cond.kind] ?? fail(`Invalid operator ${cond.kind}`);
      return [`${columnName} ${fn} ?`, [cond.value]];
    case "is-null":
      return [`${columnName} is null`, []];
    case "not-null":
      return [`${columnName} is not null`, []];
    case "in":
      return [`${columnName} = any(?)`, [cond.value]];
    case "nin":
      return [`${columnName} != any(?)`, [cond.value]];
    case "between":
      return [`${columnName} between ? and ?`, cond.value];
    default:
      assertNever(cond);
  }
}

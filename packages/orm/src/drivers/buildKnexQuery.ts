import { Knex } from "knex";
import { opToFn } from "../EntityGraphQLFilter";
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

  parsed.conditions.forEach((c) => {
    addColumnCondition(knex, query, c);
  });

  parsed.complexConditions &&
    parsed.complexConditions.forEach((c) => {
      addComplexCondition(knex, query, c);
    });

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

function addComplexCondition(knex: Knex, query: QueryBuilder, complex: ParsedExpressionFilter): void {
  query.where((q) => {
    const op = complex.op === "and" ? "andWhere" : "orWhere";
    complex.conditions.forEach((c) => {
      if ("op" in c) {
        q[op]((q) => addComplexCondition(knex, q, c));
      } else {
        q[op]((q) => addColumnCondition(knex, q, c));
      }
    });
  });
}

function addColumnCondition(knex: Knex, query: QueryBuilder, cc: ColumnCondition) {
  const { alias, column, cond } = cc;
  const columnName = knex.raw(kqDot(alias, column)) as any;
  switch (cond.kind) {
    case "eq":
    case "ne":
    case "gte":
    case "gt":
    case "lte":
    case "lt":
    case "like":
    case "ilike":
    case "contains":
    case "containedBy":
    case "overlaps":
      const fn = opToFn[cond.kind] ?? fail(`Invalid operator ${cond.kind}`);
      query.where(columnName, fn, cond.value);
      break;
    case "is-null":
      query.whereNull(columnName);
      break;
    case "not-null":
      query.whereNotNull(columnName);
      break;
    case "in":
      query.whereIn(columnName, cond.value);
      break;
    case "nin":
      query.whereNotIn(columnName, cond.value);
      break;
    case "between":
      const [min, max] = cond.value;
      query.where(columnName, ">=", min);
      query.where(columnName, "<=", max);
      break;
    default:
      assertNever(cond);
  }
}

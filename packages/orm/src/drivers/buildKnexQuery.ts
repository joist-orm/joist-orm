import { Knex } from "knex";
import { opToFn } from "../EntityGraphQLFilter";
import { ColumnCondition, ParsedExpressionFilter, ParsedFindQuery } from "../QueryParser";
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

  const primary = parsed.tables.find((t) => t.join === "primary")!;
  let query: Knex.QueryBuilder<any, any> = knex.from(`${primary.table} AS ${primary.alias}`);

  parsed.selects.forEach((s, i) => {
    const maybeDistinct = i === 0 && needsDistinct ? "distinct " : "";
    query.select(knex.raw(`${maybeDistinct}${s}`));
  });

  parsed.tables.forEach((t) => {
    switch (t.join) {
      case "inner":
        query.join(`${t.table} AS ${t.alias}`, t.col1, t.col2);
        break;
      case "outer":
        query.leftOuterJoin(`${t.table} AS ${t.alias}`, t.col1, t.col2);
        break;
      case "primary":
        // ignore
        break;
      default:
        assertNever(t);
    }
  });

  parsed.conditions.forEach((c) => {
    addColumnCondition(query, c);
  });

  parsed.complexConditions &&
    parsed.complexConditions.forEach((c) => {
      addComplexCondition(query, c);
    });

  parsed.orderBys &&
    parsed.orderBys.forEach(({ alias, column, order }) => {
      // If we're doing "select distinct" for o2m joins, then all order bys must be selects
      if (needsDistinct) {
        query.select(`${alias}.${column}`);
      }
      query.orderBy(`${alias}.${column}`, order);
    });

  if (limit) {
    query.limit(limit);
  }

  if (offset) {
    query.offset(offset);
  }

  return query;
}

function addComplexCondition(query: QueryBuilder, complex: ParsedExpressionFilter): void {
  query.where((q) => {
    const op = complex.op === "and" ? "andWhere" : "orWhere";
    complex.conditions.forEach((c) => {
      if ("op" in c) {
        q[op]((q) => addComplexCondition(q, c));
      } else {
        q[op]((q) => addColumnCondition(q, c));
      }
    });
  });
}

function addColumnCondition(query: QueryBuilder, cc: ColumnCondition) {
  const { alias, column, cond } = cc;
  const columnName = `${alias}.${column}`;
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

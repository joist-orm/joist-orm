import { Knex } from "knex";
import { Entity } from "./Entity";
import { FilterAndSettings } from "./EntityFilter";
import { opToFn } from "./EntityGraphQLFilter";
import { EntityConstructor, entityLimit } from "./EntityManager";
import { getMetadata } from "./EntityMetadata";
import { ColumnCondition, ExpressionCondition, parseFindQuery } from "./index";
import { assertNever, fail } from "./utils";
import QueryBuilder = Knex.QueryBuilder;

/**
 * Builds the SQL/knex queries for `EntityManager.find` calls.
 *
 * Note this is generally for our own internal implementation details and not meant to
 * be a user-facing QueryBuilder, i.e. users should use Knex for that and just use SQL
 * directly (for any non-trivial queries that `EntityManager.find` does not support).
 */
export function buildQuery<T extends Entity>(
  knex: Knex,
  type: EntityConstructor<T>,
  filter: FilterAndSettings<T>,
): Knex.QueryBuilder<{}, unknown[]> {
  const meta = getMetadata(type);
  const { where, conditions, orderBy, limit, offset } = filter;

  const parsed = parseFindQuery(meta, where, conditions, orderBy);

  // If we're doing o2m joins, add a `DISTINCT` clause to avoid duplicates
  const needsDistinct = parsed.tables.some((t) => t.join === "o2m");

  const primary = parsed.tables.find((t) => t.join === "primary")!;
  let query: Knex.QueryBuilder<any, any> = knex.from(`${primary.table} AS ${primary.alias}`);

  parsed.selects.forEach((s, i) => {
    const maybeDistinct = i === 0 && needsDistinct ? "distinct " : "";
    query.select(knex.raw(`${maybeDistinct}${s}`));
  });

  parsed.tables.forEach((t) => {
    if (t.join === "left") {
      query.leftOuterJoin(`${t.table} AS ${t.alias}`, t.col1, t.col2);
    } else if (t.join !== "primary") {
      query.join(`${t.table} AS ${t.alias}`, t.col1, t.col2);
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

  // Even if they already added orders, add id as the last one to get deterministic output
  query.orderBy(`${primary.alias}.id`);
  query.limit(limit || entityLimit);
  if (offset) {
    query.offset(offset);
  }

  return query as Knex.QueryBuilder<{}, unknown[]>;
}

export function abbreviation(tableName: string): string {
  return tableName
    .split("_")
    .map((w) => w[0])
    .join("");
}

function addComplexCondition(query: QueryBuilder, complex: ExpressionCondition): void {
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
    case "@>":
      query.where(columnName, "@>", cond.value);
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

import { Knex } from "knex";
import { Entity, isEntity } from "./Entity";
import { FilterAndSettings } from "./EntityFilter";
import { Operator, operators, opToFn } from "./EntityGraphQLFilter";
import { EntityConstructor, entityLimit } from "./EntityManager";
import { EntityMetadata, getMetadata, PolymorphicField } from "./EntityMetadata";
import { Column, maybeGetConstructorFromReference, parseFindQuery } from "./index";
import { assertNever, fail } from "./utils";

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
  const { where, orderBy, limit, offset } = filter;

  const parsed = parseFindQuery(meta, filter.where, filter.orderBy);

  const primary = parsed.tables.find((t) => t.join === "primary")!;
  let query: Knex.QueryBuilder<any, any> = knex.from(`${primary.table} AS ${primary.alias}`);

  parsed.selects.forEach((s) => {
    query.select(knex.raw(s));
  });

  parsed.tables.forEach((t) => {
    if (t.join === "left") {
      query.leftOuterJoin(`${t.table} AS ${t.alias}`, t.col1, t.col2);
    } else if (t.join !== "primary") {
      query.join(`${t.table} AS ${t.alias}`, t.col1, t.col2);
    }
  });

  parsed.conditions.forEach(({ alias, column, cond }) => {
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
      case "between":
        const [min, max] = cond.value;
        query.where(columnName, ">=", min);
        query.where(columnName, "<=", max);
        break;
      case "pass":
        break;
      default:
        assertNever(cond);
    }
  });

  // if (needsClassPerTableJoins(meta)) {
  //   addTablePerClassJoinsAndClassTag(knex, meta, query, alias);
  // }

  parsed.orderBys &&
    parsed.orderBys.forEach(({ alias, column, order }) => {
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

function polyColumnFor(
  meta: EntityMetadata<any>,
  field: PolymorphicField,
  value: string | Entity | EntityConstructor<any>,
): Column {
  const cstr = typeof value === "function" ? value : maybeGetConstructorFromReference(value)!;
  return (
    field.serde.columns.find((c) => c.otherMetadata().cstr === cstr) ??
    fail(`${cstr.name} cannot be used as a filter on ${field.fieldName}`)
  );
}

function addPolyClause(
  query: Knex.QueryBuilder,
  alias: string,
  field: PolymorphicField,
  meta: EntityMetadata<any>,
  value: string | Entity | EntityConstructor<any>,
  clause?: any,
) {
  clause = clause === undefined ? value : clause;
  const column = polyColumnFor(meta, field, value);
  const [, result] = addForeignKeyClause(query, alias, column, clause);
  return result;
}

function addForeignKeyClause(
  query: Knex.QueryBuilder,
  alias: string,
  column: Column,
  clause: any,
): [boolean, Knex.QueryBuilder] {
  // I.e. this could be { authorFk: authorEntity | null | id | { ...recurse... } }
  const clauseKeys =
    typeof clause === "object" && clause !== null
      ? Object.keys(clause as object).filter((key) => clause[key] !== undefined)
      : [];
  if (isEntity(clause) || typeof clause === "string" || Array.isArray(clause)) {
    // I.e. { authorFk: authorEntity | id | id[] }
    if (isEntity(clause) && clause.id === undefined) {
      // The user is filtering on an unsaved entity, which will just never have any rows, so throw in -1
      return [false, query.where(`${alias}.${column.columnName}`, -1)];
    } else if (Array.isArray(clause)) {
      return [
        false,
        query.whereIn(
          `${alias}.${column.columnName}`,
          clause.map((id) => column.mapToDb(id)),
        ),
      ];
    } else {
      return [false, query.where(`${alias}.${column.columnName}`, column.mapToDb(clause))];
    }
  } else if (clause === null) {
    // I.e. { authorFk: null | undefined }
    return [false, query.whereNull(`${alias}.${column.columnName}`)];
  } else if (clauseKeys.length === 1 && clauseKeys[0] === "id") {
    // I.e. { authorFk: { id: string } } || { authorFk: { id: string[] } }
    // If only querying on the id, we can skip the join
    return [false, addPrimitiveClause(query, alias, column, (clause as any)["id"])];
  } else if (clauseKeys.length === 1 && clauseKeys[0] === "ne") {
    // I.e. { authorFk: { ne: string | null | undefined } }
    const value = (clause as any)["ne"];
    if (value === null || value === undefined) {
      return [false, query.whereNotNull(`${alias}.${column.columnName}`)];
    } else if (typeof value === "string") {
      return [false, query.whereNot(`${alias}.${column.columnName}`, column.mapToDb(value))];
    } else {
      throw new Error("Not implemented");
    }
  } else {
    // I.e. { authorFk: { ...authorFilter... } }
    return [clause !== undefined, query];
  }
}

function addPrimitiveClause(query: Knex.QueryBuilder, alias: string, column: Column, clause: any): Knex.QueryBuilder {
  if (clause && typeof clause === "object" && operators.find((op) => Object.keys(clause).includes(op))) {
    // I.e. `{ primitiveField: { gt: value } }`
    return Object.entries(clause).reduce(
      (query, [op, value]) => addPrimitiveOperator(query, alias, column, op as Operator, value),
      query,
    );
  } else if (clause && typeof clause === "object" && "op" in clause) {
    // I.e. { primitiveField: { op: "gt", value: 1 } }`
    return addPrimitiveOperator(query, alias, column, clause.op, clause.value);
  } else if (Array.isArray(clause)) {
    // I.e. `{ primitiveField: value[] }`
    if (column.isArray) {
      return query.where(`${alias}.${column.columnName}`, "@>", column.mapToDb(clause));
    } else {
      return query.whereIn(
        `${alias}.${column.columnName}`,
        clause.map((v) => column.mapToDb(v)),
      );
    }
  } else if (clause === null) {
    // I.e. `{ primitiveField: null }`
    return query.whereNull(`${alias}.${column.columnName}`);
  } else if (clause === undefined) {
    // I.e. `{ primitiveField: undefined }`
    // Currently we treat this like a partial filter, i.e. don't include it. Seems odd
    // unless this is opt-in, i.e. maybe only do this for `findGql`?
    return query;
  } else {
    // I.e. `{ primitiveField: value }`
    // TODO In theory could add a addToQuery method to Serde to generalize this to multi-columns fields.
    return query.where(`${alias}.${column.columnName}`, column.mapToDb(clause));
  }
}

function addPrimitiveOperator(
  query: Knex.QueryBuilder,
  alias: string,
  column: Column,
  op: Operator,
  value: any,
): Knex.QueryBuilder {
  const columnName = `${alias}.${column.columnName}`;
  if (value === null || value === undefined) {
    if (op === "ne") {
      return query.whereNotNull(columnName);
    } else if (op === "eq") {
      return query.whereNull(columnName);
    } else {
      throw new Error("Only ne is supported when the value is undefined or null");
    }
  } else if (op === "in") {
    return query.whereIn(
      columnName,
      (value as Array<any>).map((v) => column.mapToDb(v)),
    );
  } else if (op === "between") {
    const values = (value as any[]).map((v) => column.mapToDb(v));
    return query.where(columnName, ">=", values[0]).where(columnName, "<=", values[1]);
  } else {
    const fn = opToFn[op] ?? fail(`Invalid operator ${op}`);
    return query.where(columnName, fn, column.mapToDb(value));
  }
}

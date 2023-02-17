import { groupBy } from "joist-utils";
import { Knex } from "knex";
import { Entity, isEntity } from "./Entity";
import { FilterAndSettings } from "./EntityFilter";
import { Operator, operators, opToFn } from "./EntityGraphQLFilter";
import { EntityConstructor, entityLimit } from "./EntityManager";
import { EntityMetadata, getMetadata, PolymorphicField } from "./EntityMetadata";
import {
  addTablePerClassJoinsAndClassTag,
  asConcreteCstr,
  Column,
  getConstructorFromTaggedId,
  maybeGetConstructorFromReference,
  maybeResolveReferenceToId,
  needsClassPerTableJoins,
  parseEntityFilter,
} from "./index";
import { fail } from "./utils";

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

  const parsed = parseEntityFilter(filter.where);

  const aliases: Record<string, number> = {};
  function getAlias(tableName: string): string {
    const abbrev = abbreviation(tableName);
    const i = aliases[abbrev] || 0;
    aliases[abbrev] = i + 1;
    return i === 0 ? abbrev : `${abbrev}${i}`;
  }

  const alias = getAlias(meta.tableName);
  let query: Knex.QueryBuilder<any, any> = knex.select<unknown>(`${alias}.*`).from(`${meta.tableName} AS ${alias}`);

  // Define a function for recursively adding joins & filters
  function addClauses(
    meta: EntityMetadata<any>,
    alias: string,
    where: object | undefined,
    orderBy: object | undefined,
  ): void {
    // Combine the where and orderBy keys so that we can add them to aliases as that same time
    // Filter out undefined values as they should be ignored (for now?)
    const keys = [
      ...(where ? Object.keys(where).filter((key) => (where as any)[key] !== undefined) : []),
      ...(orderBy ? Object.keys(orderBy).filter((key) => (orderBy as any)[key] !== undefined) : []),
    ];

    keys.forEach((key) => {
      const field = meta.allFields[key] ?? fail(`${key} not found`);

      // We may/may not have a where clause or orderBy for this key, but we should have at least one of them.
      const clause = where && (where as any)[key];
      const hasClause = where && key in where;
      const order = orderBy && (orderBy as any)[key];
      const hasOrder = !!order;

      if (field.kind === "poly") {
        if (Array.isArray(clause)) {
          // condition of `parent_foo_id in (1, 2, 3)` or `parent_bar_id in (4, 5, 6)`
          const ids = clause.map((e) => maybeResolveReferenceToId(e)!);
          const idsByConstructor = groupBy(ids, (id) => getConstructorFromTaggedId(id).name);
          query = query.where((query) =>
            field.serde.columns.reduce((query, { columnName, otherMetadata, mapToDb }) => {
              const ids = idsByConstructor[otherMetadata().cstr.name];
              return ids && ids.length > 0 ? query.orWhereIn(`${alias}.${columnName}`, ids.map(mapToDb)) : query;
            }, query),
          );
        } else if (isEntity(clause) || typeof clause === "string") {
          // condition of `parent_id = 1`
          query = addPolyClause(query, alias, field, meta, clause);
        } else if (clause === null) {
          // where they are all null
          query = field.components.reduce(
            (query, component) =>
              addPolyClause(
                query,
                alias,
                field,
                meta,
                // Not really sure if this is safe, being lazy for now...
                asConcreteCstr(component.otherMetadata().cstr),
                clause,
              ),
            query,
          );
        } else if (typeof clause === "object" && Object.keys(clause).length === 1 && "ne" in clause) {
          const { ne: value } = clause as { ne: string | Entity | undefined | null };
          if (isEntity(value) || typeof value === "string") {
            const column = polyColumnFor(meta, field, value);
            query = query.where((query) =>
              query
                .whereNot(`${alias}.${column.columnName}`, column.mapToDb(value))
                // for some reason whereNot excludes null values, so explicitly include them here
                .orWhereNull(`${alias}.${column.columnName}`),
            );
          } else if (value === null) {
            query = query.where((b) =>
              field.components.reduce((b, { columnName }) => b.orWhereNotNull(`${alias}.${columnName}`), b),
            );
          }
        }
      } else if (field.kind === "o2o") {
        // Add `otherTable.column = ...` clause, unless `key` is not in `where`, i.e. there is only an orderBy for this fk
        const otherMeta = field.otherMetadata();
        const otherAlias = getAlias(otherMeta.tableName);
        const otherColumn = otherMeta.fields[field.otherFieldName]!;

        query = query.leftJoin(
          `${otherMeta.tableName} AS ${otherAlias}`,
          `${otherAlias}.${otherColumn.serde!.columns[0].columnName}`,
          `${alias}.id`,
        );

        const [shouldAddClauses, _query] = hasClause
          ? addForeignKeyClause(query, otherAlias, otherMeta.fields["id"]!.serde!.columns[0], clause)
          : [false, query];
        query = _query;

        if (shouldAddClauses || hasOrder) {
          addClauses(otherMeta, otherAlias, shouldAddClauses ? clause : undefined, hasOrder ? order : undefined);
        }
      } else if (field.kind === "m2o") {
        const serde = (meta.fields[key] ?? fail(`${key} not found`)).serde!;
        // TODO Currently hardcoded to single-column support; poly is handled above this
        const column = serde.columns[0];

        // Add `otherTable.column = ...` clause, unless `key` is not in `where`, i.e. there is only an orderBy for this fk
        const [whereNeedsJoin, _query] = hasClause ? addForeignKeyClause(query, alias, column, clause) : [false, query];
        query = _query;
        if (whereNeedsJoin || hasOrder) {
          // Add a join for this column
          const otherMeta = field.otherMetadata();
          const otherAlias = getAlias(otherMeta.tableName);
          query = query.innerJoin(
            `${otherMeta.tableName} AS ${otherAlias}`,
            `${alias}.${column.columnName}`,
            `${otherAlias}.id`,
          );
          // Then recurse to add its conditions to the query
          addClauses(otherMeta, otherAlias, whereNeedsJoin ? clause : undefined, hasOrder ? order : undefined);
        }
      } else {
        const serde = field.serde!;
        // TODO Currently hardcoded to single-column support; poly is handled above this
        const column = serde.columns[0];
        // TODO Currently we only support base-type WHEREs if the sub-type is the main `em.find`
        // const maybeBaseAlias = field.alias;
        query = hasClause ? addPrimitiveClause(query, alias, column, clause) : query;
        // This is not a foreign key column, so it'll have the primitive filters/order bys
        if (order) {
          query = query.orderBy(`${alias}.${column.columnName}`, order);
        }
      }
    });
  }

  addClauses(meta, alias, where as object, orderBy as object);

  if (needsClassPerTableJoins(meta)) {
    addTablePerClassJoinsAndClassTag(knex, meta, query, alias);
  }

  // Even if they already added orders, add id as the last one to get deterministic output
  query = query.orderBy(`${alias}.id`);
  query = query.limit(limit || entityLimit);
  if (offset) {
    query = query.offset(offset);
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

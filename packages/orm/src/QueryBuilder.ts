import Knex, { QueryBuilder } from "knex";
import { fail } from "./utils";
import {
  Entity,
  EntityConstructor,
  EntityMetadata,
  getMetadata,
  isEntity,
  FilterOf,
  OrderOf,
  entityLimit,
} from "./EntityManager";
import { ForeignKeySerde } from "./serde";

export type OrderBy = "ASC" | "DESC";

export type BooleanFilter<N> = true | false | N;

export type ValueFilter<V, N> =
  | V
  | V[]
  | N
  // Both eq and in are redundant with `V` and `V[]` above but are convenient for matching GQL filter APIs
  | { eq: V | N }
  | { in: V[] }
  | { gt: V }
  | { gte: V }
  | { ne: V | N }
  | { lt: V }
  | { lte: V }
  | { like: V };

// For filtering by a foreign key T, i.e. either joining/recursing into with FilterQuery<T>, or matching it is null/not null/etc.
export type EntityFilter<T, I, F, N> = T | I | I[] | F | N | { ne: T | I | N };

export type BooleanGraphQLFilter = true | false | null;

/** This essentially matches the ValueFilter but with looser types to placate GraphQL. */
export type ValueGraphQLFilter<V> =
  | {
      eq?: V | null;
      in?: V[] | null;
      gt?: V | null;
      gte?: V | null;
      ne?: V | null;
      lt?: V | null;
      lte?: V | null;
      like?: V | null;
    }
  | V
  | V[]
  | null;

export type EnumGraphQLFilter<V> = V[] | null | undefined;

/** A GraphQL version of EntityFilter. */
export type EntityGraphQLFilter<T, I, F> = T | I | I[] | F | { ne: T | I } | null | undefined;

const operators = ["eq", "gt", "gte", "ne", "lt", "lte", "like", "in"] as const;
type Operator = typeof operators[number];
const opToFn: Record<Operator, string> = {
  eq: "=",
  gt: ">",
  gte: ">=",
  ne: "!=",
  lt: "<",
  lte: "<=",
  like: "LIKE",
  in: "...",
};

export type FilterAndSettings<T> = {
  where: FilterOf<T>;
  orderBy?: OrderOf<T>;
  limit?: number;
  offset?: number;
};

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
): QueryBuilder<{}, unknown[]> {
  const meta = getMetadata(type);
  const { where, orderBy, limit, offset } = filter;

  const aliases: Record<string, number> = {};
  function getAlias(tableName: string): string {
    const abbrev = abbreviation(tableName);
    const i = aliases[abbrev] || 0;
    aliases[abbrev] = i + 1;
    return `${abbrev}${i}`;
  }

  const alias = getAlias(meta.tableName);
  let query: QueryBuilder<any, any> = knex.select<unknown>(`${alias}.*`).from(`${meta.tableName} AS ${alias}`);

  // Define a function for recursively adding joins & filters
  function addClauses(
    meta: EntityMetadata<any>,
    alias: string,
    where: object | undefined,
    orderBy: object | undefined,
  ): void {
    // Combine the where and orderBy keys so that we can add them to aliases as that same time
    const keys = [...(where ? Object.keys(where) : []), ...(orderBy ? Object.keys(orderBy) : [])];

    keys.forEach((key) => {
      const column = meta.columns.find((c) => c.fieldName === key) || fail(`${key} not found`);

      // We may/may not have a where clause or orderBy for the key, but we should have at least one of them.
      const clause = where && (where as any)[key];
      const order = orderBy && (orderBy as any)[key];

      if (column.serde instanceof ForeignKeySerde) {
        // I.e. this could be { authorFk: authorEntity | null | id | { ...recurse... } }
        const clauseKeys = typeof clause === "object" && clause !== null ? Object.keys(clause as object) : [];
        // Assume we have to join to the next level based on whether the key in each hash it set
        let joinForClause = false;
        let joinForOrder = order !== undefined;
        if (isEntity(clause) || typeof clause == "string" || Array.isArray(clause)) {
          // I.e. { authorFk: authorEntity | id | id[] }
          if (isEntity(clause) && clause.id === undefined) {
            // The user is filtering on an unsaved entity, which will just never have any rows, so throw in -1
            query = query.where(`${alias}.${column.columnName}`, -1);
          } else if (Array.isArray(clause)) {
            query = query.whereIn(
              `${alias}.${column.columnName}`,
              clause.map((id) => column.serde.mapToDb(id)),
            );
          } else {
            query = query.where(`${alias}.${column.columnName}`, column.serde.mapToDb(clause));
          }
        } else if ((clause === null || clause === undefined) && where && Object.keys(where).includes(key)) {
          // I.e. { authorFk: null | undefined }
          query = query.whereNull(`${alias}.${column.columnName}`);
        } else if (clauseKeys.length === 1 && clauseKeys[0] === "id") {
          // I.e. { authorFk: { id: string } } || { authorFk: { id: string[] } }
          // If only querying on the id, we can skip the join
          const value = (clause as any)["id"];
          if (Array.isArray(value)) {
            query = query.whereIn(
              `${alias}.${column.columnName}`,
              value.map((id) => column.serde.mapToDb(id)),
            );
          } else {
            query = query.where(`${alias}.${column.columnName}`, column.serde.mapToDb(value));
          }
        } else if (clauseKeys.length === 1 && clauseKeys[0] === "ne") {
          // I.e. { authorFk: { id: { ne: string | null | undefined } } }
          const value = (clause as any)["ne"];
          if (value === null || value === undefined) {
            query = query.whereNotNull(`${alias}.${column.columnName}`);
          } else if (typeof value === "string") {
            query = query.whereNot(`${alias}.${column.columnName}`, column.serde.mapToDb(value));
          } else {
            throw new Error("Not implemented");
          }
        } else {
          // I.e. { authorFk: { ...authorFilter... } }
          joinForClause = clause !== undefined;
        }
        if (joinForClause || joinForOrder) {
          // Add a join for this column
          const otherMeta = column.serde.otherMeta();
          const otherAlias = getAlias(otherMeta.tableName);
          query = query.innerJoin(
            `${otherMeta.tableName} AS ${otherAlias}`,
            `${alias}.${column.columnName}`,
            `${otherAlias}.id`,
          );
          // Then recurse to add its conditions to the query
          addClauses(otherMeta, otherAlias, joinForClause ? clause : undefined, joinForOrder ? order : undefined);
        }
      } else {
        // This is not a foreign key column, so it'll have the primitive filters/order bys
        if (clause && typeof clause === "object" && operators.find((op) => Object.keys(clause).includes(op))) {
          // I.e. `{ primitiveField: { op: value } }`
          const op = Object.keys(clause)[0] as Operator;
          const value = (clause as any)[op];
          if (value === null || value === undefined) {
            if (op === "ne") {
              query = query.whereNotNull(`${alias}.${column.columnName}`);
            } else if (op === "eq") {
              query = query.whereNull(`${alias}.${column.columnName}`);
            } else {
              throw new Error("Only ne is supported when the value is undefined or null");
            }
          } else if (op === "in") {
            query = query.whereIn(
              `${alias}.${column.columnName}`,
              (value as Array<any>).map((v) => column.serde.mapToDb(v)),
            );
          } else {
            const fn = opToFn[op];
            query = query.where(`${alias}.${column.columnName}`, fn, column.serde.mapToDb(value));
          }
        } else if (Array.isArray(clause)) {
          // I.e. `{ primitiveField: value[] }`
          query = query.whereIn(
            `${alias}.${column.columnName}`,
            clause.map((v) => column.serde.mapToDb(v)),
          );
        } else if (clause === null) {
          // I.e. `{ primitiveField: null }`
          query = query.whereNull(`${alias}.${column.columnName}`);
        } else if (clause !== undefined) {
          // I.e. `{ primitiveField: value }`
          // TODO In theory could add a addToQuery method to Serde to generalize this to multi-columns fields.
          query = query.where(`${alias}.${column.columnName}`, column.serde.mapToDb(clause));
        }
        if (order) {
          query = query.orderBy(`${alias}.${column.columnName}`, order);
        }
      }
    });
  }

  addClauses(meta, alias, where as object, orderBy as object);

  if (!orderBy) {
    query = query.orderBy(`${alias}.id`);
  }
  query = query.limit(limit || entityLimit);
  if (offset) {
    query = query.offset(offset);
  }

  return query as QueryBuilder<{}, unknown[]>;
}

function abbreviation(tableName: string): string {
  return tableName
    .split("_")
    .map((w) => w[0])
    .join("");
}

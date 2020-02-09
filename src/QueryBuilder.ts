import Knex, { QueryBuilder } from "knex";
import { fail } from "./utils";
import { Entity, EntityConstructor, FilterQuery, getMetadata } from "./EntityManager";

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
  where: FilterQuery<T>,
): QueryBuilder<{}, unknown[]> {
  const meta = getMetadata(type);

  let query = knex({ t: meta.tableName })
    .select("t.*")
    .orderBy("t.id");

  Object.entries(where).forEach(([key, value]) => {
    const column = meta.columns.find(c => c.fieldName === key) || fail();
    query = query.where(column.columnName, value);
  });

  return query as QueryBuilder<{}, unknown[]>;
}

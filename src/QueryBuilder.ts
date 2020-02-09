import Knex, { QueryBuilder } from "knex";
import { fail } from "./utils";
import { Entity, EntityConstructor, FilterQuery, getMetadata } from "./EntityManager";

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

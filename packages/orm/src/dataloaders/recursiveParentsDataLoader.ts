import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { EntityManager } from "../EntityManager";
import {
  abbreviation,
  addTablePerClassJoinsAndClassTag,
  assertIdsAreTagged,
  deTagIds,
  kq,
  ManyToOneField,
  ParsedFindQuery,
} from "../index";
import { ManyToRecursiveCollectionImpl } from "../relations/ManyToRecursiveCollection";

export function recursiveParentsDataLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  collection: ManyToRecursiveCollectionImpl<T, U>,
): DataLoader<string, U[]> {
  // The metadata for the entity that contains the collection
  const { meta, fieldName } = collection;
  const batchKey = `${meta.tableName}-${fieldName}`;
  return em.getLoader("m2o-recursive", batchKey, async (_keys) => {
    assertIdsAreTagged(_keys);
    const keys = deTagIds(meta, _keys);
    const o2m = meta.allFields[collection.m2oFieldName] as ManyToOneField;
    const { columnName } = o2m.serde.columns[0];

    const alias = abbreviation(meta.tableName);
    const query: ParsedFindQuery = {
      selects: [`"${alias}".*`],
      tables: [
        // We still select directly from our table, and join into the CTE so that we
        // can use `addTablePerClassJoinsAndClassTag` to get inheritance added for free.
        { alias, join: "primary", table: meta.tableName },
        { alias: `${alias}_cte`, join: "inner", table: `${alias}_cte`, col1: `${alias}.id`, col2: `${alias}_cte.id` },
      ],
      orderBys: [{ alias, column: "id", order: "ASC" }],
      cte: {
        // b is our base case, which is all children we're looking for parents of,
        // and r is the recursive case of finding the parent.
        sql: `
          WITH RECURSIVE ${alias}_cte AS (
             SELECT b.id, b.${columnName} FROM ${kq(meta.tableName)} b WHERE b.id = ANY(?)
             UNION
             SELECT r.id, r.${columnName} FROM ${kq(meta.tableName)} r JOIN ${alias}_cte ON r.id = ${alias}_cte.${columnName}
          )`,
        bindings: [keys],
      },
    };

    addTablePerClassJoinsAndClassTag(query, meta, alias, true);

    const rows = await em.driver.executeFind(em, query, {});

    // Since we're preloading m2os up the tree, merely having the entities in the EM is enough
    // for the ManyToOneReferenceImpl to find them, so we don't need to map them back to the
    // keys, or push them into the preloader cache.
    em.hydrate(meta.cstr, rows);

    return _keys.map(() => []);
  });
}

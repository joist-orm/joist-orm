import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { EntityManager, getEmInternalApi } from "../EntityManager";
import {
  abbreviation,
  addTablePerClassJoinsAndClassTag,
  assertIdsAreTagged,
  deTagIds,
  getField,
  isLoadedCollection,
  kq,
  ManyToOneField,
  maybeResolveReferenceToId,
  OneToManyField,
  ParsedFindQuery,
} from "../index";
import { RecursiveChildrenCollectionImpl } from "../relations/RecursiveCollection";
import { groupBy } from "../utils";

export function recursiveChildrenDataLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  collection: RecursiveChildrenCollectionImpl<T, U>,
): DataLoader<string, U[]> {
  const { meta, fieldName } = collection;
  const batchKey = `${meta.tableName}-${fieldName}`;
  return em.getLoader("o2m-recursive", batchKey, async (_keys) => {
    assertIdsAreTagged(_keys);
    const keys = deTagIds(meta, _keys);
    const o2m = meta.allFields[collection.o2mFieldName] as OneToManyField;
    const m2o = meta.allFields[o2m.otherFieldName] as ManyToOneField;
    const { columnName } = m2o.serde.columns[0];

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
        // ...can we skip the base row being our already loaded row?
        sql: `
          WITH RECURSIVE ${alias}_cte AS (
             SELECT b.id, b.${columnName} FROM ${kq(meta.tableName)} b WHERE b.id = ANY(?)
             UNION
             SELECT r.id, r.${columnName} FROM ${kq(meta.tableName)} r JOIN ${alias}_cte ON r.${columnName} = ${alias}_cte.id
          )`,
        bindings: [keys],
      },
    };

    addTablePerClassJoinsAndClassTag(query, meta, alias, true);

    const rows = await em.driver.executeFind(em, query, {});

    const entities = em.hydrate(meta.cstr, rows);

    const entitiesById = groupBy(entities, (entity) => {
      const ownerId = maybeResolveReferenceToId(getField(entity, m2o.fieldName));
      return ownerId ?? "dummyNoLongerOwned";
    });

    for (const [ownerId, children] of entitiesById) {
      if (ownerId !== "dummyNoLongerOwned") {
        getEmInternalApi(em).setPreloadedRelation(ownerId, o2m.fieldName, children);
        (em.getEntity(ownerId) as any)[o2m.fieldName].preload();
      }
    }
    for (const entity of entities) {
      if (!isLoadedCollection(entity[o2m.fieldName])) {
        getEmInternalApi(em).setPreloadedRelation(entity.id, o2m.fieldName, []);
        entity[o2m.fieldName].preload();
      }
    }

    return _keys.map(() => []);
  });
}

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
        // b is our base case, which is the immediate children of the parents in `keys`, and r is the
        // recursive case of finding their children.
        sql: `
          WITH RECURSIVE ${alias}_cte AS (
             SELECT b.id, b.${columnName} FROM ${kq(meta.tableName)} b WHERE b.${columnName} = ANY(?)
             UNION
             SELECT r.id, r.${columnName} FROM ${kq(meta.tableName)} r JOIN ${alias}_cte ON r.${columnName} = ${alias}_cte.id
          )`,
        bindings: [keys],
      },
    };

    addTablePerClassJoinsAndClassTag(query, meta, alias, true);

    const rows = await em.driver.executeFind(em, query, {});
    const entities = em.hydrate(meta.cstr, rows);

    // For all the entities we found, group them by their parent (or the root node, which has no parent)
    const entitiesById = groupBy(entities, (entity) => {
      const parentId = maybeResolveReferenceToId(getField(entity, m2o.fieldName));
      return parentId ?? "root";
    });

    // For each found parent, use the preloading infra to inject the children into the relation
    for (const [parentId, children] of entitiesById) {
      if (parentId !== "root") {
        getEmInternalApi(em).setPreloadedRelation(parentId, o2m.fieldName, children);
        // I thought we could delay calling this, but currently `em.populate` calls `preload()` explicitly
        (em.getEntity(parentId) as any)[o2m.fieldName].preload();
      }
    }

    // Any entity[o2m] still not loaded must be a leaf which didn't have any children; go ahead and mark it as loaded
    for (const entity of entities) {
      if (!isLoadedCollection(entity[o2m.fieldName])) {
        getEmInternalApi(em).setPreloadedRelation(entity.id, o2m.fieldName, []);
        entity[o2m.fieldName].preload();
      }
    }

    // We used preloading to load keys + any recursive keys, so the return value doesn't matter
    return _keys.map(() => []);
  });
}

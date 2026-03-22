import { getMetadataForType } from "../configure";
import { Entity } from "../Entity";
import { EntityManager, getEmInternalApi } from "../EntityManager";
import {
  isLoadedCollection,
  keyToTaggedId,
  kq,
  kqDot,
  kqStar,
  ManyToManyField,
  ParsedFindQuery,
  unsafeDeTagIds,
} from "../index";
import { RecursiveM2mCollectionImpl } from "../relations/RecursiveCollection";
import { abbreviation } from "../utils";
import { BatchLoader } from "./BatchLoader";

export const recursiveM2mOperation = "m2m-recursive";

export function recursiveM2mBatchLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  collection: RecursiveM2mCollectionImpl<T, U>,
): BatchLoader<Entity> {
  let { meta, fieldName } = collection;
  while (!(collection.m2mFieldName in meta.allFields) && meta.baseType) meta = getMetadataForType(meta.baseType);
  const batchKey = `${meta.tableName}-${fieldName}`;
  return em.getBatchLoader(recursiveM2mOperation, batchKey, async (entities) => {
    const m2mField = meta.allFields[collection.m2mFieldName] as ManyToManyField;
    const { joinTableName, columnNames } = m2mField;
    const thisColumn = columnNames[0];
    const otherColumn = columnNames[1];

    const seedIds = unsafeDeTagIds(entities.map((e) => e.idTagged));

    // Use a recursive CTE to walk the join table and return all join rows for the seed
    // entities and all transitively-reachable entities. JoinRows.loadRows then calls
    // em.loadAll internally to hydrate the actual entities on both sides.
    const jt = abbreviation(joinTableName);
    const query: ParsedFindQuery = {
      selects: [kqStar(jt)],
      tables: [{ alias: jt, join: "primary", table: "cte" }],
      orderBys: [{ alias: jt, column: "id", order: "ASC" }],
      ctes: [
        {
          alias: "cte",
          query: {
            kind: "raw",
            // Base case returns full join rows for the seed entities; recursive case
            // follows otherColumn → thisColumn to discover transitively-reachable rows.
            sql: `
              SELECT b.* FROM ${kq(joinTableName)} b WHERE ${kqDot("b", thisColumn)} = ANY(?)
              UNION
              SELECT r.* FROM ${kq(joinTableName)} r JOIN cte ON ${kqDot("r", thisColumn)} = cte.${kq(otherColumn)}
            `,
            bindings: [seedIds],
          },
          recursive: true,
        },
      ],
    };

    const joinTableRows = await em["executeFind"](meta, recursiveM2mOperation, query, {});

    // Collect all entity IDs from both sides of the join rows. Entities that only appear
    // on otherColumn (not thisColumn) are leaf nodes with no outgoing connections — since
    // the CTE transitively discovers everything reachable, we know their m2m is empty and
    // can mark it loaded here, avoiding a separate load via findUnloadedCollections.
    const uniqueIds = new Set(entities.map((e) => e.idTagged));
    for (const row of joinTableRows) {
      uniqueIds.add(keyToTaggedId(meta, row[thisColumn])!);
      uniqueIds.add(keyToTaggedId(meta, row[otherColumn])!);
    }

    const m2mCollection = (entities[0] as any)[collection.m2mFieldName];
    const joinRows = getEmInternalApi(em).joinRows(m2mCollection);

    // loadRows calls em.loadAll internally to hydrate all referenced entities
    const tuples: [string, string][] = [...uniqueIds].map((id) => [thisColumn, id]);
    await joinRows.loadRows(tuples, joinTableRows);

    // Set preloaded relations and call preload() for each entity's m2m collection
    const api = getEmInternalApi(em);
    for (const id of uniqueIds) {
      const entity = em.getEntity(id);
      if (!entity) continue;
      const others = joinRows.getOthers(thisColumn, entity);
      api.setPreloadedRelation(entity.idTagged!, m2mField.fieldName, others);
      (entity as any)[m2mField.fieldName].preload();
    }

    // Mark any entity whose m2m is still not loaded as having an empty collection (leaf nodes)
    for (const id of uniqueIds) {
      const entity = em.getEntity(id);
      if (!entity) continue;
      if (!isLoadedCollection((entity as any)[m2mField.fieldName])) {
        api.setPreloadedRelation(entity.idTagged!, m2mField.fieldName, []);
        (entity as any)[m2mField.fieldName].preload();
      }
    }
  });
}

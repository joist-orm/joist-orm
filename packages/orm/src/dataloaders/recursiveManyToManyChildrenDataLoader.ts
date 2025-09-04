import DataLoader from "dataloader";
import { getMetadataForType } from "../configure";
import { Entity } from "../Entity";
import { EntityManager, getEmInternalApi } from "../EntityManager";
import {
  addTablePerClassJoinsAndClassTag,
  getField,
  isLoadedCollection,
  isLoadedOneToOneReference,
  kq,
  ManyToManyField,
  maybeResolveReferenceToId,
  ParsedFindQuery,
  unsafeDeTagIds,
} from "../index";
import { RecursiveManyToManyChildrenCollectionImpl } from "../relations/RecursiveCollection";
import { abbreviation, groupBy } from "../utils";

export function recursiveManyToManyChildrenDataLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  collection: RecursiveManyToManyChildrenCollectionImpl<T, U>,
): DataLoader<Entity, U[]> {
  let { meta, fieldName } = collection;
  // Walk up the inheritance tree to find the meta that actually declares this M2M field,
  // in case this loader is called on a subtype that inherits the relation.
  while (!(collection.m2mFieldName in meta.fields) && meta.baseType) meta = getMetadataForType(meta.baseType);
  const batchKey = `${meta.tableName}-${fieldName}`;
  return em.getLoader("m2m-children-recursive", batchKey, async (parents) => {
    const m2m = meta.allFields[collection.m2mFieldName] as ManyToManyField;
    const [sourceColumn, targetColumn] = m2m.columnNames;

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
        // b is our base case, which is the immediate children of the parents, and r is the
        // recursive case of finding their children.
        sql: `
          WITH RECURSIVE ${alias}_cte AS (
            SELECT b.${targetColumn} AS id
            FROM ${kq(m2m.joinTableName)} b
            WHERE b.${sourceColumn} = ANY(?)
            UNION
            SELECT r.${targetColumn} AS id
            FROM ${kq(m2m.joinTableName)} r
            JOIN ${alias}_cte ON r.${sourceColumn} = ${alias}_cte.id
          )
        `,
        bindings: [unsafeDeTagIds(parents.map((e) => e.idTagged))],
      },
    };

    addTablePerClassJoinsAndClassTag(query, meta, alias, true);

    const rows = await em.driver.executeFind(em, query, {});
    const entities = em.hydrate(meta.cstr, rows);

    // For all the entities we found, group them by their parent (or the root node, which has no parent)
    const entitiesById = groupBy(entities, (entity) => {
      const parentId = maybeResolveReferenceToId(getField(entity, m2m.fieldName));
      return parentId ?? "root";
    });

    // For each found parent, use the preloading infra to inject the children into the relation
    for (const [parentId, children] of entitiesById) {
      if (parentId !== "root") {
        getEmInternalApi(em).setPreloadedRelation(parentId, m2m.fieldName, children);
        (em.getEntity(parentId) as any)[m2m.fieldName].preload();
      }
    }

    // Any entity[m2m] still not loaded must be a leaf which didn't have any children; go ahead and mark it as loaded
    for (const entity of [...parents, ...entities]) {
      if (!isLoadedCollection(entity[m2m.fieldName]) && !isLoadedOneToOneReference(entity[m2m.fieldName])) {
        getEmInternalApi(em).setPreloadedRelation(entity.id, m2m.fieldName, []);
        entity[m2m.fieldName].preload();
      }
    }

    // We used preloading to load keys + any recursive keys, so the return value doesn't matter
    return parents.map(() => []);
  });
}

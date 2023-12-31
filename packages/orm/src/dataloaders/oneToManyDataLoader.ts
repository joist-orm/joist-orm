import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { EntityManager } from "../EntityManager";
import { getField } from "../fields";
import {
  OneToManyCollection,
  ParsedFindQuery,
  abbreviation,
  addTablePerClassJoinsAndClassTag,
  assertIdsAreTagged,
  deTagIds,
  maybeResolveReferenceToId,
} from "../index";
import { groupBy } from "../utils";

export function oneToManyDataLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  collection: OneToManyCollection<T, U>,
): DataLoader<string, U[]> {
  // The metadata for the entity that contains the collection
  const { meta: oneMeta, fieldName } = collection;
  const batchKey = `${oneMeta.tableName}-${fieldName}`;
  return em.getLoader("o2m-load", batchKey, async (_keys) => {
    const { otherMeta: meta } = collection;

    assertIdsAreTagged(_keys);
    const keys = deTagIds(oneMeta, _keys);

    const alias = abbreviation(meta.tableName);
    const query: ParsedFindQuery = {
      selects: [`"${alias}".*`],
      tables: [{ alias, join: "primary", table: meta.tableName }],
      condition: {
        op: "and",
        conditions: [
          { alias, column: collection.otherColumnName, dbType: meta.idDbType, cond: { kind: "in", value: keys } },
        ],
      },
      orderBys: [{ alias, column: "id", order: "ASC" }],
    };

    addTablePerClassJoinsAndClassTag(query, meta, alias, true);
    // Skip maybeAddOrderBy b/c we'll sort in memory anyway
    // maybeAddNotSoftDeleted(conditions, meta, alias, "include");

    const rows = await em.driver.executeFind(em, query, {});

    const entities = em.hydrate(meta.cstr, rows, { overwriteExisting: false });
    // .filter((e) => !e.isDeletedEntity);

    const entitiesById = groupBy(entities, (entity) => {
      // TODO If this came from the UoW, it may not be an id? I.e. pre-insert.
      const ownerId = maybeResolveReferenceToId(getField(entity, collection.otherFieldName, true));
      // We almost always expect ownerId to be found, b/c normally we just hydrated this entity
      // directly from a SQL row with owner_id=X, however we might be loading this collection
      // (i.e. find all children where owner_id=X) when the SQL thinks a child is still pointing
      // at the parent (i.e. owner_id=X in the db), but our already-loaded child has had its
      // `child.owner` field either changed to some other owner, or set to undefined. In either,
      // that child should no longer be parent of this owner's collection, so just return a
      // dummy value.
      return ownerId ?? "dummyNoLongerOwned";
    });

    return _keys.map((k) => entitiesById.get(k) || []);
  });
}

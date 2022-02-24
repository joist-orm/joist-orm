import DataLoader from "dataloader";
import { Entity, EntityManager } from "../EntityManager";
import { assertIdsAreTagged, deTagIds, maybeResolveReferenceToId, OneToManyCollection } from "../index";
import { getOrSet, groupBy } from "../utils";

export function oneToManyDataLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  collection: OneToManyCollection<T, U>,
): DataLoader<string, U[]> {
  // The metadata for the entity that contains the collection
  const { meta, fieldName } = collection;
  const loaderName = `${meta.tableName}.${fieldName}`;
  return getOrSet(em.loadLoaders, loaderName, () => {
    return new DataLoader<string, U[]>(async (_keys) => {
      const { otherMeta } = collection;

      assertIdsAreTagged(_keys);
      const keys = deTagIds(meta, _keys);

      const { em } = collection.entity;
      const rows = await em.driver.loadOneToMany(em, collection, keys);

      const entities = rows.map((row) => em.hydrate(otherMeta.cstr, row, { overwriteExisting: false }));
      // .filter((e) => !e.isDeletedEntity);

      const rowsById = groupBy(entities, (entity) => {
        // TODO If this came from the UoW, it may not be an id? I.e. pre-insert.
        const ownerId = maybeResolveReferenceToId(entity.__orm.data[collection.otherFieldName]);
        // We almost always expect ownerId to be found, b/c normally we just hydrated this entity
        // directly from a SQL row with owner_id=X, however we might be loading this collection
        // (i.e. find all children where owner_id=X) when the SQL thinks a child is still pointing
        // at the parent (i.e. owner_id=X in the db), but our already-loaded child has had its
        // `child.owner` field either changed to some other owner, or set to undefined. In either,
        // that child should no longer be parent of this owner's collection, so just return a
        // dummy value.
        return ownerId ?? "dummyNoLongerOwned";
      });
      return _keys.map((k) => rowsById.get(k) || []);
    });
  });
}

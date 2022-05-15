import DataLoader from "dataloader";
import { Entity, EntityManager, EntityMetadata } from "../EntityManager";
import { assertIdsAreTagged, deTagIds } from "../keys";
import { getOrSet, indexBy } from "../utils";

export function loadDataLoader<T extends Entity>(
  em: EntityManager,
  meta: EntityMetadata<T>,
): DataLoader<string, T | undefined> {
  return getOrSet(em.loadLoaders, meta.type, () => {
    return new DataLoader<string, T | undefined>(async (_keys) => {
      assertIdsAreTagged(_keys);
      const keys = deTagIds(meta, _keys);

      const rows = await em.driver.load(em, meta, keys);

      // Pass overwriteExisting (which is the default anyway) because it might be EntityManager.refresh calling us.
      const entities = rows.map((row) => em.hydrate(meta.cstr, row, { overwriteExisting: true }));
      const entitiesById = indexBy(entities, (e) => e.idTagged!);

      // Return the results back in the same order as the keys
      return _keys.map((k) => {
        const entity = entitiesById.get(k);
        // We generally expect all of our entities to be found, but they may not for API calls like
        // `findOneOrFail` or for `EntityManager.refresh` when the entity has been deleted out from
        // under us.
        if (entity === undefined) {
          const existingEntity = em.findExistingInstance<T>(k);
          if (existingEntity) {
            existingEntity.__orm.deleted = "deleted";
          }
        }
        return entity;
      });
    });
  });
}

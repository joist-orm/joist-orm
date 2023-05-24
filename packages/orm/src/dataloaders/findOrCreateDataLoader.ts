import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { FilterWithAlias } from "../EntityFilter";
import { EntityConstructor, EntityManager, OptsOf, TooManyError } from "../EntityManager";
import { whereFilterHash } from "./findDataLoader";

interface Key<T extends Entity> {
  where: Partial<OptsOf<T>>;
  ifNew: OptsOf<T>;
  upsert: Partial<OptsOf<T>> | undefined;
}

export function findOrCreateDataLoader<T extends Entity>(
  em: EntityManager,
  type: EntityConstructor<T>,
  where: Partial<OptsOf<T>>,
  softDeletes: "include" | "exclude",
): DataLoader<Key<T>, T> {
  // The findOrCreateDataLoader `where` is flat (only top-level opts are allowed), so we can use
  // Object.keys to get `{ firstName: "a1" }` and `{ firstName: "a2" }` batched to the same dataloader,
  // primarily so that we can dedupe `{ firstName: "a1" }` if .load-d twice.
  const batchKey = `${type.name}-${Object.keys(where).join("-")}-${softDeletes}`;
  return em.getLoader<Key<T>, T>(
    "find-or-create",
    batchKey,
    async (keys) => {
      // Ideally we would check `keys` for the same `where` clause with different
      // ifNew+upsert combinations, and then blow up/tell the user, because they're
      // asking for the entity to be created/updated slightly differently.
      return Promise.all(
        keys.map(async ({ where, ifNew, upsert }) => {
          const entities = await em.find(type, where as FilterWithAlias<T>, { softDeletes });
          let entity: T;
          if (entities.length > 1) {
            throw new TooManyError();
          } else if (entities.length === 1) {
            entity = entities[0];
          } else {
            entity = em.create(type, { ...where, ...(ifNew as object) } as OptsOf<T>);
          }
          if (upsert) {
            entity.set(upsert);
          }
          return entity;
        }),
      );
    },
    // Our filter tuple is a complex object, so object-hash it to ensure caching works
    { cacheKeyFn: whereFilterHash },
  );
}

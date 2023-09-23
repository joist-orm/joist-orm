import DataLoader from "dataloader";
import { Entity, isEntity } from "../Entity";
import { FilterWithAlias } from "../EntityFilter";
import { EntityConstructor, EntityManager, OptsOf, TooManyError, sameEntity } from "../EntityManager";
import { getMetadata } from "../EntityMetadata";
import { ManyToOneReference, PolymorphicReference, isLoadedReference } from "../relations";
import { fail } from "../utils";
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
          // Before we find/create an entity, see if we have a maybe-new one in the EM already.
          // This will also use any WIP changes we've made to the found entity, which ideally is
          // something `em.find` would do as well, but its queries are much more complex..
          const inMemory = em.entities.filter((e) => e instanceof type && entityMatches(e, where));
          if (inMemory.length > 1) {
            throw new TooManyError(`Found more than one existing ${type.name} with ${whereAsString(where)}`);
          } else if (inMemory.length === 1) {
            const entity = inMemory[0] as T;
            if (upsert) {
              entity.set(upsert);
            }
            return entity;
          }

          // If there is a param like `{ publisher: newPublisherEntity }`, then we know that
          // an entity matching this condition can't be in the db anyway, so skip the em.find
          const hasNewParam = Object.values(where).some((v) => isEntity(v) && v.isNewEntity);
          if (hasNewParam) {
            const entity = em.create(type, { ...where, ...(ifNew as object) } as OptsOf<T>);
            if (upsert) {
              entity.set(upsert);
            }
            return entity;
          }

          // If we didn't find it in the EM, do the db query/em.create
          const entities = await em.find(type, { ...(where as FilterWithAlias<T>) }, { softDeletes });
          let entity: T;
          if (entities.length > 1) {
            throw new TooManyError(`Found more than one existing ${type.name} with ${whereAsString(where)}`);
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

/** A simple in-memory match of `entity` against a mini/flat "WHERE clause" of `opts`. */
function entityMatches<T extends Entity>(entity: T, opts: Partial<OptsOf<T>>): boolean {
  const meta = getMetadata(entity);
  return Object.entries(opts).every(([fieldName, value]) => {
    const field = meta.allFields[fieldName] ?? fail(`Invalid field ${fieldName}`);
    const fn = fieldName as keyof T & keyof OptsOf<T>;
    switch (field.kind) {
      case "primaryKey":
      case "primitive":
      case "enum":
        return entity[fn] === opts[fn];
      case "m2o":
      case "poly":
        const relation = entity[fn] as ManyToOneReference<T, any, any> | PolymorphicReference<T, any, any>;
        if (isLoadedReference(relation)) {
          // Prefer using `.get` because it will handle new/id-less entities
          return sameEntity(relation.get, (opts as any)[fn]);
        } else {
          // Otherwise use ids
          return sameEntity(relation.id as any, (opts as any)[fn]);
        }
      default:
        throw new Error(`Unsupported field ${fieldName}`);
    }
  });
}

function whereAsString(where: object): string {
  return Object.entries(where)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

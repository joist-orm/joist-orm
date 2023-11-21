import DataLoader from "dataloader";
import { Entity, isEntity } from "../Entity";
import { FilterWithAlias } from "../EntityFilter";
import { EntityConstructor, EntityManager, OptsOf, TooManyError, sameEntity } from "../EntityManager";
import { EntityMetadata, getMetadata } from "../EntityMetadata";
import { ManyToOneReference, PolymorphicReference, isLoadedReference } from "../relations";
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
  // Do some extra logic to make citext not create duplicate entities
  const meta = getMetadata(type);
  const hasAnyCitext = Object.values(meta.allFields).some((f) => f.kind === "primitive" && f.citext);
  const cacheKeyFn: (key: Key<T>) => Key<T> = !hasAnyCitext
    ? whereFilterHash
    : (key) =>
        whereFilterHash({
          where: maybeLower(meta, key.where),
          ifNew: maybeLower(meta, key.ifNew as any),
          upsert: maybeLower(meta, key.upsert),
        } as any) as Key<T>;

  // Use `whereFilterHash` to batch the same `findOrCreate` `where: { firstName: "a1" }` calls together
  // to avoid creating duplicates. Also use `whereFilterHash` b/c if a new entity is included in `where`,
  // it will use `entity.toString()` to keep it unique from other new entities.
  const whereValue = whereFilterHash(!hasAnyCitext ? (where as any) : (maybeLower(meta, where) as any));
  const batchKey = `${type.name}-${whereValue}-${softDeletes}`;

  return em.getLoader<Key<T>, T>(
    "find-or-create",
    batchKey,
    async (keys) => {
      // Because our `batchKey` is based only on the `where` clause, if the user called
      // `findOrCreate({ firstName: a1 })` multiple times, but with different ifNew/upsert
      // conditions (or different cased strings and is using a citext column), we'll end
      // up with multiple keys...
      //
      // This is fundamentally asking to create the same entity, but with different ifNew/upsert
      // conditions, which we could fail on, but for now just take the first tuple of
      // {where/ifNew/upsert} and assume it wins
      const [{ where, ifNew, upsert }] = keys;
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
        return keys.map(() => entity);
      }

      // If there is a param like `{ publisher: newPublisherEntity }`, then we know that
      // an entity matching this condition can't be in the db anyway, so skip the em.find
      const hasNewEntityParam = Object.values(where).some((v) => isEntity(v) && v.isNewEntity);
      if (hasNewEntityParam) {
        const entity = em.create(type, { ...where, ...(ifNew as object) } as OptsOf<T>);
        if (upsert) {
          entity.set(upsert);
        }
        return keys.map(() => entity);
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
      return keys.map(() => entity);
    },
    // Our filter tuple is a complex object, so object-hash it to ensure caching works
    { cacheKeyFn },
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
      case "enum":
        return entity[fn] === opts[fn];
      case "primitive":
        if (field.citext) {
          return compareCaseInsensitive(entity[fn], opts[fn]);
        } else {
          return entity[fn] === opts[fn];
        }
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

function compareCaseInsensitive(str1: any, str2: any): boolean {
  return (
    str1 !== undefined &&
    str2 !== undefined &&
    typeof str1 === "string" &&
    typeof str2 === "string" &&
    str1.toLowerCase() === str2.toLowerCase()
  );
}

/** Returns a copy of `opts` with any `citext` values turned to lower case. */
function maybeLower(meta: EntityMetadata, opts: object | undefined) {
  if (!opts) return opts;
  return Object.fromEntries(
    Object.entries(opts).map(([k, v]) => {
      const field = meta.allFields[k];
      return [k, field.kind === "primitive" && field.citext ? v?.toLowerCase() : v];
    }),
  );
}

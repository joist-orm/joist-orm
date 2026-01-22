import DataLoader from "dataloader";
import { Entity, isEntity } from "../Entity";
import { EntityConstructor, EntityManager, TooManyError, sameEntity } from "../EntityManager";
import { EntityMetadata, getMetadata } from "../EntityMetadata";
import { ManyToOneReference, PolymorphicReference, isLoadedReference } from "../relations";
import { OptsOf } from "../typeMap";
import { cleanStringValue } from "../utils";
import { whereFilterHash } from "./findDataLoader";

interface FindOrCreateKey<T extends Entity> {
  ifNew: OptsOf<T>;
  upsert: Partial<OptsOf<T>> | undefined;
}

export function findOrCreateDataLoader<T extends Entity>(
  em: EntityManager,
  type: EntityConstructor<T>,
  where: Partial<OptsOf<T>>,
  softDeletes: "include" | "exclude",
): DataLoader<FindOrCreateKey<T>, T> {
  const meta = getMetadata(type);

  // Do some extra logic to make unclean strings/citext not create duplicate entities
  const hasAnyStrings = Object.values(meta.allFields).some((f) => f.kind === "primitive" && f.type === "string");
  const hasAnyCitext = Object.values(meta.allFields).some((f) => f.kind === "primitive" && f.citext);

  // The `where` here will be later used to `em.create`, so we only clean (not lower for citext)
  where = hasAnyStrings ? maybeClean(meta, where) : where;
  // Use `whereFilterHash` to batch the same `findOrCreate` `where: { firstName: "a1" }` calls together to avoid duplicates
  const whereValue = whereFilterHash(
    // Only maybeLower for the purposes of batching, not the later em.create
    hasAnyCitext ? maybeLower(meta, where) : (where as any),
  );
  const batchKey = `${type.name}-${whereValue}-${softDeletes}`;

  const invalidKeys = Object.keys(where).filter((key) => {
    const field = meta.allFields[key] ?? fail(`Invalid field ${key}`);
    const supported =
      field.kind === "primitive" || field.kind === "enum" || field.kind === "m2o" || field.kind === "poly";
    return !supported;
  });
  if (invalidKeys.length > 0) {
    throw new Error(
      "findOrCreate only supports primitive, enum, o2m, or poly fields in the where clause. Invalid keys: " +
        invalidKeys.join(", "),
    );
  }

  return em.getLoader<FindOrCreateKey<T>, T>(
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
      const [{ ifNew, upsert }] = keys;

      // Before we find/create an entity, see if we have a maybe-new one in the EM already.
      // This will also use any WIP changes we've made to the found entity, which ideally is
      // something `em.find` would do as well, but its queries are much more complex...
      const inMemory = em.filterEntities(type, where);
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
      const entities = (
        await em.find(
          type,
          // Convert `publisher: undefined` --> `publisher: null`, and we need to make a copy anyway
          Object.fromEntries(Object.entries(where).map(([k, v]) => [k, v === undefined ? null : v])) as any,
          { softDeletes },
        )
      ).filter((e) => !e.isDeletedEntity);
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
    { cacheKeyFn: whereFilterHash as any },
  );
}

/** A simple in-memory match of `entity` against a mini/flat "WHERE clause" of `opts`. */
export function entityMatches<T extends Entity>(entity: T, opts: Partial<OptsOf<T>>): boolean {
  const meta = getMetadata(entity);
  return Object.entries(opts).every(([fieldName, value]) => {
    const field = meta.allFields[fieldName] ?? fail(`Invalid field ${fieldName}`);
    const fn = fieldName as keyof T & keyof OptsOf<T>;
    switch (field.kind) {
      case "primaryKey":
      case "enum":
        return entity[fn] === value;
      case "primitive":
        if (field.citext) {
          return compareCaseInsensitive(entity[fn], value);
        } else {
          return entity[fn] === value;
        }
      case "m2o":
      case "poly":
        const relation = entity[fn] as ManyToOneReference<T, any, any> | PolymorphicReference<T, any, any>;
        if (isLoadedReference(relation)) {
          // Prefer using `.get` because it will handle new/id-less entities
          return sameEntity(relation.get, value as any);
        } else if (relation.isSet) {
          // Otherwise use ids
          return sameEntity(relation.id as any, value as any);
        } else {
          return value === undefined;
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
function maybeLower<T extends object | undefined>(meta: EntityMetadata, opts: T): T {
  if (!opts) return opts;
  let result: T | undefined = undefined;
  for (const k in opts) {
    const v = (opts as any)[k];
    const field = meta.allFields[k];
    const isString = field && field.kind === "primitive" && field.type === "string";
    if (isString && field.citext) {
      const lowered = v?.toLowerCase();
      if (lowered !== v) {
        result ??= { ...opts };
        (result as any)[k] = lowered as any;
      }
    }
  }
  return result ?? opts;
}

/** Returns a copy of `opts` with any string values trimmed/coalesced. */
function maybeClean<T extends object | undefined>(meta: EntityMetadata, opts: T): T {
  if (!opts) return opts;
  let result: T | undefined = undefined;
  for (const k in opts) {
    const v = (opts as any)[k];
    const field = meta.allFields[k];
    const isString = field && field.kind === "primitive" && field.type === "string";
    if (isString && field.sanitize !== false) {
      const cleaned = cleanStringValue(v);
      if (cleaned !== v) {
        result ??= { ...opts }; // Only create copy on first change
        (result as any)[k] = cleaned;
      }
    }
  }
  return result ?? opts;
}

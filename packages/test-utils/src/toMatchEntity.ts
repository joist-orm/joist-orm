import CustomMatcherResult = jest.CustomMatcherResult;
// @ts-ignore
import matchers from "expect/build/matchers";
import {
  AsyncProperty,
  Collection,
  Entity,
  EntityManager,
  getMetadata,
  isAsyncProperty,
  isCollection,
  isEntity,
  isPersistedAsyncProperty,
  isReference,
  Reference,
} from "joist-orm";

export async function toMatchEntity<T>(actual: Entity, expected: MatchedEntity<T>): Promise<CustomMatcherResult> {
  // Because the `actual` entity has lots of __orm, Reference, Collection, etc cruft in it,
  // we make a simplified copy of it, where we use the keys in `expected` to pull out/eval a
  // subset of the complex keys in an entity to be "dumb data" versions of themselves.
  const clean = {};
  const { em } = actual;

  // Because we might assert again `expect(entity).toMatchEntity({ children: [{ name: "p1" }])`, we keep
  // a queue of entities/copies to make, and work through it as we recurse through the expected/actual pair.
  const queue: [any, any, any][] = [[actual, expected, clean]];
  while (queue.length > 0) {
    const [actual, expected, clean] = queue.pop()!;
    const keys = expected ? Object.keys(expected) : ["id"];
    for (const key of keys) {
      const value = actual[key];
      if (
        value &&
        (isReference(value) || isCollection(value) || isAsyncProperty(value) || isPersistedAsyncProperty(value))
      ) {
        // If something has a `.load` it could be a Reference.load or a Collection.load, either way lazy load it
        const loaded = await value.load();
        if (loaded instanceof Array) {
          const actualList = loaded;
          const expectedList = expected[key];
          const cleanList = [];
          // Do a hacky zip of each actual/expected pair
          for (let i = 0; i < Math.max(actualList.length, expectedList.length); i++) {
            const actualI = actualList[i];
            const expectedI = expectedList[i];
            // If actual is a list of entities (and expected is not), make a copy of each
            // so that we can recurse into their `{ title: ... }` properties.
            if (isEntity(actualI) && !isEntity(expectedI) && expectedI) {
              const cleanI = {};
              queue.push([actualI, expectedI, cleanI]);
              cleanList.push(cleanI);
            } else {
              // Given we're stopping here, make sure neither side is an entity
              if (i < expectedList.length) {
                expectedList[i] = maybeTestId(em, expectedI);
              }
              if (i < actualList.length) {
                cleanList.push(maybeTestId(em, actualI));
              }
            }
          }
          clean[key] = cleanList;
        } else {
          // If the `.load` result wasn't a list, assume it's an entity that we'll copy
          if (isEntity(loaded) && !isEntity(expected[key])) {
            const loadedClean = {};
            queue.push([loaded, expected[key], loadedClean]);
            clean[key] = loadedClean;
          } else {
            expected[key] = maybeTestId(em, expected[key]);
            clean[key] = maybeTestId(em, loaded);
          }
        }
      } else {
        // Otherwise assume it's regular data. Probably need to handle getters/promises?
        clean[key] = value;
      }
    }
  }

  // @ts-ignore
  return matchers.toMatchObject.call(this, clean, expected);
}

function maybeTestId(em: EntityManager, maybeEntity: any): any {
  return isEntity(maybeEntity) ? getTestId(em, maybeEntity) : maybeEntity;
}

/** Returns either the persisted id or `tag#<offset-in-EntityManager>`. */
function getTestId(em: EntityManager, entity: Entity): string {
  if (entity.id) {
    return entity.id;
  }
  const meta = getMetadata(entity);
  const sameType = em.entities.filter((e) => e instanceof meta.cstr);
  return `${meta.tagName}#${sameType.indexOf(entity) + 1}`;
}

/**
 * Given a Joist entity `T`, "flattens out" the Reference/Collections.
 *
 * I.e. so that you can `toMatchEntity({ otherEntity: { name: "foo" } })` even though
 * `otherEntity` is technically a joist `Reference` or `Collection`.
 *
 * We allow `| null` so that `toMatchEntity` can work against optional fields
 * that are returned from GraphQL object resolvers.
 */
export type MatchedEntity<T> = {
  [K in keyof T]?: T[K] extends Reference<any, infer U, any>
    ? MatchedEntity<U> | U
    : T[K] extends Collection<any, infer U>
    ? Array<MatchedEntity<U> | U>
    : T[K] extends AsyncProperty<any, infer V>
    ? V
    : T[K] | null;
};

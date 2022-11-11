import CustomMatcherResult = jest.CustomMatcherResult;
// @ts-ignore
import matchers from "expect/build/matchers";
import { isPlainObject } from "is-plain-object";
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

export function toMatchEntity<T>(actual: Entity, expected: MatchedEntity<T>): CustomMatcherResult {
  // Because the `actual` entity has lots of __orm, Reference, Collection, etc cruft in it,
  // we make a simplified copy of it, where we use the keys in `expected` to pull out/eval a
  // subset of the complex keys in an entity to be "dumb data" versions of themselves.
  const clean = Array.isArray(expected) ? [] : {};

  // Because we might assert again `expect(entity).toMatchEntity({ children: [{ name: "p1" }])`, we keep
  // a queue of entities/copies to make, and work through it as we recurse through the expected/actual pair.
  const queue: [any, any, any][] = [[actual, expected, clean]];
  while (queue.length > 0) {
    const [actual, expected, clean] = queue.pop()!;

    // If our top-level toMatchEntity was passed an array, make sure we compare all entries
    // in both arrays, basically like the zip down below.
    const keys =
      actual instanceof Array ? [...Array(Math.max(actual.length, expected.length)).keys()] : Object.keys(expected);

    for (const key of keys) {
      let actualValue = actual[key];
      const expectedValue = expected?.[key];

      // We assume the test is asserting already-loaded / DeepNew entities, so just call .get
      if (
        isReference(actualValue) ||
        isCollection(actualValue) ||
        isAsyncProperty(actualValue) ||
        isPersistedAsyncProperty(actualValue)
      ) {
        actualValue = (actualValue as any).get;
      }

      if (actualValue instanceof Array) {
        const actualList = actualValue;
        const expectedList = expectedValue;
        const cleanList = [];
        // Do a hacky zip of each actual/expected pair
        for (let i = 0; i < Math.max(actualList.length, expectedList.length); i++) {
          const actualI = actualList[i];
          const expectedI = expectedList[i];
          // If actual is a list of entities (and expected is not), make a copy of each
          // so that we can recurse into their `{ title: ... }` properties.
          if (isEntity(actualI) && isPlainObject(expectedI)) {
            const cleanI = Array.isArray(expectedI) ? [] : {};
            queue.push([actualI, expectedI, cleanI]);
            cleanList.push(cleanI);
          } else {
            // Given we're stopping here, make sure neither side is an entity
            if (i < expectedList.length) {
              expectedList[i] = maybeTestId(expectedI);
            }
            if (i < actualList.length) {
              cleanList.push(maybeTestId(actualI));
            }
          }
        }
        clean[key] = cleanList;
      } else if (isPlainObject(expectedValue)) {
        // We have an expected value that the user wants to fuzzy match against, so recurse
        // to pick out a subset of clean values (i.e. not the connection pool) to assert against.
        const cleanValue = Array.isArray(expectedValue) ? [] : {};
        queue.push([actualValue, expectedValue, cleanValue]);
        clean[key] = cleanValue;
      } else {
        // We've hit a non-list/non-object literal expected value, so clean both
        // expected+clean keys to make sure they're not entities, and stop recursion.
        if (key in expected) expected[key] = maybeTestId(expectedValue);
        if (key in actual) clean[key] = maybeTestId(actualValue);
      }
    }
  }

  // @ts-ignore
  return matchers.toMatchObject.call(this, clean, expected);
}

function maybeTestId(maybeEntity: any): any {
  return isEntity(maybeEntity) ? getTestId(maybeEntity.em, maybeEntity) : maybeEntity;
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
    : T[K] extends Entity | null | undefined
    ? MatchedEntity<T[K]> | T[K] | null | undefined
    : T[K] extends ReadonlyArray<infer U | undefined>
    ? readonly (MatchedEntity<U> | U | undefined)[]
    : T[K] extends ReadonlyArray<infer U> | null
    ? readonly (MatchedEntity<U> | U | null)[]
    : // We recurse similar to a DeepPartial
      MatchedEntity<T[K]> | null;
};

import CustomMatcherResult = jest.CustomMatcherResult;
import { Collection, Entity, Reference } from "joist-orm";

export async function toMatchEntity<T>(actual: Entity, expected: MatchedEntity<T>): Promise<CustomMatcherResult> {
  // Because the `actual` entity has lots of __orm, Reference, Collection, etc cruft in it,
  // we make a simplified copy of it, where we use the keys in `expected` to pull out/eval a
  // subset of the complex keys in an entity to be "dumb data" versions of themselves.
  const copy = {};

  // Because we might assert again `expect(entity).toMatchEntity({ children: [{ name: "p1" }])`, we keep
  // a queue of entities/copies to make, and work through it as we recurse through the expected/actual pair.
  const queue: [any, any, any][] = [[actual, expected, copy]];
  while (queue.length > 0) {
    const [actual, expected, copy] = queue.pop()!;
    const keys = Object.keys(expected);
    for (const key of keys) {
      const value = actual[key];
      if (value && typeof value === "object" && "load" in value) {
        // If something has a `.load` it could be a Reference.load or a Collection.load, either way lazy load it
        const loaded = await value.load();
        if (loaded instanceof Array) {
          const actualList = loaded;
          const expectedList = expected[key];
          const copyList = [];
          // Do a hacky zip of each actual/expected pair
          for (let i = 0; i < Math.max(actualList.length, expectedList.length); i++) {
            const actualI = actualList[i];
            const expectedI = expectedList[i];
            if (actualI && expectedI && typeof actualI === "object" && "__orm" in actualI) {
              const child = {};
              queue.push([actualI, expectedI, child]);
              copyList.push(child);
            } else {
              copyList.push(actualI);
            }
          }
          copy[key] = copyList;
        } else {
          // If the `.load` result wasn't a list, assume it's an entity that we'll copy
          const child = {};
          queue.push([loaded, expected[key], child]);
          copy[key] = child;
        }
      } else {
        // Otherwise assume it's regular data. Probably need to handle getters/promises?
        copy[key] = value;
      }
    }
  }

  // Blatantly grab `toMatchObject` from the guts of expect
  const { getMatchers } = require("expect/build/jestMatchersObject");
  // @ts-ignore
  return getMatchers().toMatchObject.call(this, copy, expected);
}

/**
 * Given a Joist entity `T`, "flattens out" the Reference/Collections.
 *
 * I.e. so that you can `toMatchEntity({ otherEntity: { name: "foo" } })` even though
 * `otherEntity` is technically a joist `Reference` or `Collection`.
 */
export type MatchedEntity<T> = {
  [K in keyof T]?: T[K] extends Reference<any, infer U, any>
    ? MatchedEntity<U>
    : T[K] extends Collection<any, infer U>
    ? Array<MatchedEntity<U>>
    : T[K];
};

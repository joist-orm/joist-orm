import CustomMatcherResult = jest.CustomMatcherResult;
import {
  AsyncProperty,
  BaseEntity,
  Collection,
  Entity,
  EntityManager,
  getMetadata,
  isAsyncProperty,
  isCollection,
  isDefined,
  isEntity,
  isReactiveField,
  isReference,
  Reference,
} from "joist-orm";
import { isPlainObject } from "joist-utils";

// const { matchers } = (globalThis as any)[Symbol.for("$$jest-matchers-object")];

/**
 * Provides convenient `toMatchObject`-style matching for Joist entities.
 *
 * The biggest differences over `toMatchObject` are:
 *
 * - We un-wrap relations like m2o/o2m to just the underlying object/arrays, to make
 *   asserting against the entities look like asserting against POJOs
 * - We prune the expected/actual values to be as minimal as possible, to avoid Jest
 *   recursively crawling into connection pools or other misc non-useful things in the diffs
 */
export function toMatchEntity<T extends object>(actual: T, expected: MatchedEntity<T>): CustomMatcherResult {
  // We're given expected, which is an object literal of what the user wants to match
  // against (some intermixed POJOs & entities) and actual (which similarly could be
  // intermixed POJOs & entities, but will likely be more sprawling because it's the
  // full result, and not the subset we're asserting against).
  //
  // Given this, first make a safe clone of `expected`, i.e. turn entities into strings.
  // After that, use `expected` as a template to pick keys out of actual. Finally, do the
  // same "clean clone" of actual, and compare the two.
  const cleanExpected = deepClone(expected);
  const cleanActual = deepClone(deepMirror(cleanExpected, actual));
  // Watch for `expect(someAuthor).toMatchEntity(a1)` as we'll turn `someAuthor` into "a:1`,
  // so can't use toMatchObject anymore.
  if (typeof cleanActual !== "object") {
    // @ts-ignore
    return matchers.toEqual.call(this, cleanActual, cleanExpected);
  } else {
    // @ts-ignore
    return matchers.toMatchObject.call(this, cleanActual, cleanExpected);
  }
}

function maybeTestId(maybeEntity: any): any {
  return isEntity(maybeEntity) ? getTestId(maybeEntity.em, maybeEntity) : maybeEntity;
}

/** Returns either the persisted id or `tag#<offset-in-EntityManager>`. */
function getTestId(em: EntityManager, entity: Entity): string {
  if (entity.idMaybe) {
    return entity.idTagged;
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
export type MatchedEntity<T> =
  | undefined
  | T
  | {
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

/**
 * Make a "new actual" based on the subset shape of expected.
 *
 * We don't have cycle detection, but that should be fine b/c the user types
 * out the expected as an object literal, so it shouldn't have cycles
 */
function deepMirror(expected: any, actual: any): any {
  // If we've hit a point where the `expected` input is not a POJO object literal/array
  // declaring the subset of the shape to assert against, just return actual as-is.
  // This might be a Date (safe) or an Entity (unsafe) or something else, but if so it will
  // get cleaned up by the `deepClone` pass.
  if (!isPlainObject(expected) && !Array.isArray(expected)) return actual;
  if (!isDefined(actual)) return actual;
  // Make a new actual that is a subset that matches expected
  const subset: any = Array.isArray(expected) ? [] : ({} as any);
  // If both are arrays, fill out the whole array
  const keys = Array.isArray(actual) ? Object.keys(actual) : Object.keys(expected);
  for (const key of keys) {
    if (key in actual) {
      // Even if actualValue is an Entity, if expected has a key drilling in to it, we want to object literal-ize it
      subset[key] = deepMirror((expected as any)[key], maybeGetRelation(actual[key]));
    }
  }
  return subset;
}

/** Make a clone of `obj`, but only recurse into POJOs and Arrays, and replace entities if we find them. */
function deepClone(obj: unknown, map = new WeakMap()): unknown {
  if (obj instanceof BaseEntity) {
    return maybeTestId(obj);
  } else if (obj && typeof obj === "object" && (isPlainObject(obj) || Array.isArray(obj))) {
    if (map.has(obj)) return map.get(obj);
    const result = Array.isArray(obj) ? [] : {};
    map.set(obj, result);
    Object.assign(result, ...Object.keys(obj).map((key) => ({ [key]: deepClone((obj as any)[key], map) })));
    return result;
  } else {
    return obj;
  }
}

/** Flattens/simplifies relations into their actual value, i.e. "calls get". */
function maybeGetRelation(actualValue: unknown): unknown {
  if (
    isReference(actualValue) ||
    isCollection(actualValue) ||
    isAsyncProperty(actualValue) ||
    isReactiveField(actualValue)
  ) {
    return getWithSoftDeleted(actualValue);
  }
  return actualValue;
}

/**
 * Adds back soft-deleted to `.get`.
 *
 * In Joist, `.get` filters both soft and hard deleted entities, because `.get`
 * is likely used by real business logic that doesn't want to see either.
 *
 * However, in tests with `toMatchEntity`, we take a stronger stance that the
 * developer needs to know "this is _soft_ deleted and not hard deleted", so
 * we add-back soft deleted entities.
 *
 * We do this by calling `getWithDeleted`, which returns all hard and soft
 * deleted entities, and then filtering out the hard deletes.
 */
function getWithSoftDeleted(relation: any): any {
  const r = "getWithDeleted" in relation ? relation.getWithDeleted : relation.get;
  return Array.isArray(r) ? r.filter((e: any) => !e.isDeletedEntity) : r;
}

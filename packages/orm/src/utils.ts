import { Entity } from "./Entity";
import { New } from "./loadHints";

export type MaybePromise<T> = T | Promise<T>;

/**
 * Given a `MaybePromise` of T, invoke `callback` against `T` either immediately or via `then`.
 *
 * This is the same as:
 *
 * ```
 * const r = await maybePromise;
 * return callback(r;;
 * ```
 *
 * But saves an `await` if `maybePromise` is not actually a promise.
 */
export function maybePromiseThen<T, U>(promiseOrObj: MaybePromise<T>, callback: (obj: T) => U): MaybePromise<U> {
  return promiseOrObj instanceof Promise ? promiseOrObj.then(callback) : callback(promiseOrObj);
}

export function getOrSet<T extends Record<keyof unknown, unknown>>(
  record: T,
  key: keyof T,
  defaultValue: T[keyof T] | (() => T[keyof T]),
): T[keyof T] {
  if (record[key] === undefined) {
    record[key] = defaultValue instanceof Function ? defaultValue() : defaultValue;
  }
  return record[key];
}

export function fail(message?: string): never {
  throw new Error(message || "Failed");
}

export function remove<T>(array: T[], t: T): void {
  const index = array.indexOf(t);
  if (index > -1) {
    array.splice(index, 1);
  }
}

/** Returns 0 inclusive to n exclusive. */
export function zeroTo(n: number): number[] {
  return [...Array(n).keys()];
}

export function groupBy<T, Y = T>(list: T[], fn: (x: T) => string, valueFn?: (x: T) => Y): Map<string, Y[]> {
  const result = new Map<string, Y[]>();
  list.forEach((o) => {
    const group = fn(o);
    if (!result.has(group)) {
      result.set(group, []);
    }
    result.get(group)!.push(valueFn === undefined ? (o as any as Y) : valueFn(o));
  });
  return result;
}

export function indexBy<T, Y = T>(list: T[], fn: (x: T) => string, valueFn?: (x: T) => Y): Map<string, Y> {
  const result = new Map<string, Y>();
  list.forEach((o) => {
    const group = fn(o);
    result.set(group, valueFn === undefined ? (o as any as Y) : valueFn(o));
  });
  return result;
}

export function partition<T>(array: ReadonlyArray<T>, f: (el: T) => boolean): [T[], T[]] {
  const trueElements: T[] = [];
  const falseElements: T[] = [];
  array.forEach((el) => {
    if (f(el)) {
      trueElements.push(el);
    } else {
      falseElements.push(el);
    }
  });
  return [trueElements, falseElements];
}

// Utility function to wrap an object or value in an array, unless it's already an array
export function toArray<T>(maybeArray: T | T[] | undefined): T[] {
  return Array.isArray(maybeArray) ? maybeArray : maybeArray === undefined ? [] : [maybeArray];
}

// Utility type to strip off null and defined and infer only T.
export type NullOrDefinedOr<T> = T | null | undefined;

export function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}

/**
 * Utility method for casting `entity` to a `New` entity.
 *
 * Note that we don't actually do any runtime checks; a very simple one would be if the id is undefined,
 * but we want this method to be used in tests that are post-`flush` but still "know" the entity is
 * effectively new / fully loaded.
 *
 * Granted, we could do a runtime check that all relations are loaded.
 */
export function asNew<T extends Entity>(entity: T): New<T> {
  return entity as New<T>;
}

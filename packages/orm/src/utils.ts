import { Entity } from "./Entity";
import { OrderBy } from "./EntityFilter";
import { isDefined } from "./EntityManager";
import { New } from "./loadHints";
import { isReactiveField, isReference } from "./relations";

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

export function failIfAnyRejected<T>(results: PromiseSettledResult<T>[]): T[] {
  const rejects = results.filter((r) => r.status === "rejected");
  // For now just throw the 1st rejection; this should be pretty rare
  if (rejects.length > 0 && rejects[0].status === "rejected") {
    throw rejects[0].reason;
  }
  return results.map((r) => (r as PromiseFulfilledResult<T>).value);
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

/**
 * A utility to ensure a Promise-returning method actually returns a promise and doesn't
 * early exit. Using `async function` guarantees these semantics, but sometimes we avoid
 * `async` as a likely-premature optimization to avoid the overhead.
 */
export function tryResolve<T>(fn: () => T): Promise<T> {
  try {
    return Promise.resolve(fn());
  } catch (e) {
    return Promise.reject(e);
  }
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

export function maybeRemove<T>(array: T[] | undefined, t: T): void {
  if (array) remove(array, t);
}

export function maybeAdd<T>(array: T[], t: T): void {
  if (!array.includes(t)) {
    array.push(t);
  }
}

export function clear<T>(array: T[]): void {
  array.splice(0, array.length);
}

/** Returns 0 inclusive to n exclusive. */
export function zeroTo(n: number): number[] {
  return [...Array(n).keys()];
}

export function groupBy<T, Y = T, K = string>(list: readonly T[], fn: (x: T) => K, valueFn?: (x: T) => Y): Map<K, Y[]> {
  const result = new Map<K, Y[]>();
  list.forEach((o) => {
    const group = fn(o);
    if (!result.has(group)) {
      result.set(group, []);
    }
    result.get(group)!.push(valueFn === undefined ? (o as any as Y) : valueFn(o));
  });
  return result;
}

export function indexBy<T, Y = T, K = string>(list: T[], fn: (x: T) => K, valueFn?: (x: T) => Y): Map<K, Y> {
  const result = new Map<K, Y>();
  list.forEach((o) => {
    const group = fn(o);
    result.set(group, valueFn === undefined ? (o as any as Y) : valueFn(o));
  });
  return result;
}

export function batched<T>(list: Array<T>, n: number): T[][] {
  const result = [] as T[][];
  for (let i = 0; i < list.length; i += n) {
    result.push(list.slice(i, i + n));
  }
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
export function toArray<T>(maybeArray: T | T[] | undefined | null): T[] {
  return Array.isArray(maybeArray) ? maybeArray : maybeArray === undefined || maybeArray === null ? [] : [maybeArray];
}

// Utility type to strip off null and defined and infer only T.
export type NullOrDefinedOr<T> = T | null | undefined;

export function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}

export function abbreviation(tableName: string): string {
  return tableName
    .split("_")
    .map((w) => w[0])
    .join("");
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

export function compareValues(av: any, bv: any, direction: OrderBy): number {
  const d = direction === "ASC" ? 1 : -1;
  if (isReactiveField(av)) {
    av = !av.isSet ? -1 : av.get;
  }
  if (isReactiveField(bv)) {
    bv = !bv.isSet ? -1 : bv.get;
  }
  if (isReference(av) && isReference(bv)) {
    const aIsNew = av.isLoaded && (av as any).get?.isNewEntity;
    const bIsNew = bv.isLoaded && (bv as any).get?.isNewEntity;
    const bothSame = (aIsNew && bIsNew) || (!aIsNew && !bIsNew);
    if (!bothSame) {
      if (aIsNew) return 1 * d; // New entities are always "greater than" loaded entities
      if (bIsNew) return -1 * d; // Loaded entities are always "less than" new entities
    }
    av = av.idTaggedMaybe ?? (av.isLoaded && (av as any).get?.toString()) ?? undefined;
    bv = bv.idTaggedMaybe ?? (bv.isLoaded && (bv as any).get?.toString()) ?? undefined;
  }
  if (!isDefined(av) || !isDefined(bv)) {
    return !av && !bv ? 0 : (!av ? 1 : -1) * d;
  } else if (typeof av === "number" && typeof bv === "number") {
    return (av - bv) * d;
  } else if (typeof av === "string" && typeof bv === "string") {
    return av.localeCompare(bv) * d;
  } else if (av instanceof Date && bv instanceof Date) {
    return ((av as Date).getTime() - (bv as Date).getTime()) * d;
  } else {
    throw new Error(`Unsupported sortBy values ${av}, ${bv}`);
  }
}

/** A ~naive deep merge that requires already-normalized hints and will mutate `source`. */
// https://gist.github.com/ahtcx/0cd94e62691f539160b32ecda18af3d6
export function mergeNormalizedHints(target: any, source: any): void {
  for (const key of Object.keys(source)) {
    // We assume both target & source are already normalized, i.e. we won't have
    // source="books" and target={books: "title"}. They will both be {books: ...}.
    if (target[key]) {
      mergeNormalizedHints(source[key], target[key]);
    }
  }
  Object.assign(target, source);
}

const newLine = /\n/g;
const doubleSpace = /  +/g;

export function cleanStringValue(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

/** Strips new lines/indentation from our `UPDATE` string; doesn't do any actual SQL param escaping/etc. */
export function cleanSql(sql: string): string {
  return sql.trim().replace(newLine, "").replace(doubleSpace, " ");
}

// Collections return an array, so do a hot-path `.flat()`
export function flatAndUnique<T extends unknown>(list: (T | T[] | undefined)[]): Set<T> {
  const result = new Set<T>();
  for (const c of list) {
    if (Array.isArray(c)) {
      for (const e of c) result.add(e);
    } else if (c) {
      result.add(c);
    }
  }
  return result;
}

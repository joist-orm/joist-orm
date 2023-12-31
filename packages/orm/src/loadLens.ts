import { lensDataLoader } from "./dataloaders/lensDataLoader";
import { Entity, isEntity } from "./Entity";
import { EntityMetadata, Field, getMetadata } from "./EntityMetadata";

/** Generically matches on a Reference/Collection's load method. */
type LoadLike<U> = { load(): Promise<U> };

/** Generically matches a property or zero-arg method that returns a promise. */
type PromiseFnLike<U> = () => PromiseLike<U>;

/** Given a parent type P, and a new type V, returns V[] if P is already an array, i.e. we're in flatMap mode. */
// The extra `[]` around `V` and `ReadonlyArray<any>` are to keep the type as `Array<Foo | undefined>`
// instead of `Foo[] | undefined[]`.
//
// When `P extends ReadonlyArray, i.e. we're in flatMap mode, we're also in filter undefined mode.
type MaybeArray<P, V> = P extends ReadonlyArray<any>
  ? [V] extends [ReadonlyArray<infer U>]
    ? DropUndefined<U>[]
    : DropUndefined<V>[]
  : V;

/** Given a type T that we come across in the path, de-array it to continue our flatMap-ish semantics. */
type MaybeDropArray<T> = T extends ReadonlyArray<infer U> ? U : T;

type DropUndefined<T> = Exclude<T, undefined>;

/**
 * A type for declaratively walking the object graph.
 *
 * This is not technically a Lens that can `get/set`, but the idea is generally the same.
 *
 * `T` is the type we're on, i.e. when `T = Author` we can do `.firstName` or `.lastName.
 * `R` is either a `T` or `T[]` or `T | undefined` and just captures whether we've hit a
 * list at any point in the lens navigation path.
 */
export type Lens<T, R = T> = {
  [P in keyof T]: T[P] extends LoadLike<infer U>
    ? Lens<MaybeDropArray<DropUndefined<U>>, MaybeArray<R, U>>
    : T[P] extends PromiseFnLike<infer U>
      ? Lens<MaybeDropArray<DropUndefined<U>>, MaybeArray<R, U>>
      : Lens<MaybeDropArray<DropUndefined<T[P]>>, MaybeArray<R, T[P]>>;
};

/**
 * Allows declaratively loading/traversing several layers of references at once.
 *
 * I.e.:
 *
 * ```typescript
 * const publisher = await book.load(b => b.author.publisher);
 * ```
 */
// For some reason accepting Lens<this, this> does not work when called from within the entity
// subclass itself, so we use the codegen hammer in our subclass to force the right Lens type
// in a .load stub that just calls us for the implementation.
export async function loadLens<T extends Entity, U, V>(
  start: T | T[],
  fn: (lens: Lens<T>) => Lens<U, V>,
  opts: { forceReload?: boolean; sql?: boolean } = {},
): Promise<V> {
  // If we're already loaded, just return
  if (!opts.forceReload && isLensLoaded(start, fn)) {
    return getLens(start, fn);
  }

  const paths = collectPaths(fn);

  // See if we can load this via SQL
  if (opts.sql) {
    const meta = Array.isArray(start)
      ? isEntity(start[0]) && getMetadata(start[0])
      : isEntity(start) && getMetadata(start);
    if (!meta) return [] as V;
    // Are all paths SQL query-able?
    if (!isAllSqlPaths(meta, paths)) {
      throw new Error("Cannot use loadLens opts.sql with non-SQL paths");
    }
    // If there is only 1 path, don't both with the fancy join
    if (paths.length > 1) {
      // TODO We can only do this is _none_ of the paths are loaded, otherwise we'll miss WIP mutations
      if (Array.isArray(start)) {
        const em = start[0].em;
        return (await lensDataLoader(em, meta.cstr, true, paths).loadMany(start.map((e) => e.idTagged))) as V;
      } else {
        const em = start.em;
        return (await lensDataLoader(em, meta.cstr, false, paths).load(start.idTagged)) as V;
      }
    }
  }

  let current: any = start;
  let seenSoftDeleted = false;
  // Now evaluate each step of the path
  for await (const path of paths) {
    if (Array.isArray(current)) {
      current = (await Promise.all(current.map((c) => maybeLoad(c, path, opts)))).flat();
      current = [...new Set(current.filter((c: any) => c !== undefined && !c.isSoftDeletedEntity))];
    } else {
      current = await maybeLoad(current, path, opts);
      seenSoftDeleted ||= (current as any)?.isSoftDeletedEntity;
      // If we had been traversing m2o -> m2o (i.e. book -> author) and just hit an o2m/m2m (i.e.
      // book -> author -> comments), and any of our prior m2os like `author` had been soft deleted,
      // just filter everything out.
      //
      // Otherwise, we keep `book -> author`, even if author is soft-deleted, b/c it changes the return
      // type from "author" to "author | undefined".
      if (Array.isArray(current) && seenSoftDeleted) {
        return [] as any;
      }
    }
  }
  return current!;
}

export function isAllSqlPaths(meta: EntityMetadata, paths: string[]): boolean {
  for (let i = 0, current = meta; i < paths.length; i++) {
    const next = current.allFields[paths[i]];
    if (next && (next.kind === "m2o" || next.kind === "m2m" || next.kind === "o2m" || next.kind === "o2o")) {
      current = next.otherMetadata();
    } else {
      return false;
    }
  }
  return true;
}

// Given BookReview+[book, author] return [Author, books+bookReviews]
export function mapPathsToTarget(source: EntityMetadata, paths: string[]): [EntityMetadata, [EntityMetadata, Field][]] {
  let other = source;
  let fields: [EntityMetadata, Field][] = [];
  for (let i = 0; i < paths.length; i++) {
    const next = other.allFields[paths[i]];
    if (next && (next.kind === "m2o" || next.kind === "m2m" || next.kind === "o2m" || next.kind === "o2o")) {
      other = next.otherMetadata();
      fields.push([other, other.allFields[next.otherFieldName]]);
    } else {
      throw new Error("Either not an all-SQL path or not supported yet");
    }
  }
  return [other, fields.reverse()];
}

function maybeLoad(object: any, path: string, opts: { forceReload?: boolean }): unknown {
  if (object === undefined || object === null) {
    return undefined;
  }
  const value = object[path];
  if (value && typeof value === "object" && "load" in value) {
    return value.load(opts);
  } else if (value && typeof value === "function") {
    return value.apply(object);
  } else {
    return value;
  }
}

/**
 * The synchronous version of `loadLens`.
 *
 * This assumes you've first evaluated the lens with `loadLens` and now can access it synchronously.
 */
export function getLens<T, U, V>(start: T | T[], fn: (lens: Lens<T>) => Lens<U, V>): V {
  const paths = collectPaths(fn);
  let current: any = start;
  let seenSoftDeleted = false;
  // Now evaluate each step of the path
  for (const path of paths) {
    if (Array.isArray(current)) {
      current = current.map((c) => maybeGet(c, path)).flat();
      current = [...new Set(current.filter((c: any) => c !== undefined && !c.isSoftDeletedEntity))];
    } else {
      current = maybeGet(current, path);
      seenSoftDeleted ||= (current as any)?.isSoftDeletedEntity;
      // If we had been traversing m2o -> m2o and just hit an o2m/m2m, and any of our
      // prior m2os had been soft deleted, just filter everything out.
      if (Array.isArray(current) && seenSoftDeleted) {
        return [] as any;
      }
    }
  }
  return current!;
}

/** Returns whether a lens is loaded; primarily for deeply loaded instances in tests. */
export function isLensLoaded<T, U, V>(start: T | T[], fn: (lens: Lens<T>) => Lens<U, V>): boolean {
  // This is pretty hacky, but we just call `get` and assume it will blow up with "not loaded" errors.
  try {
    getLens(start, fn);
    return true;
  } catch {
    return false;
  }
}

function maybeGet(object: any, path: string): unknown {
  if (object === undefined || object === null) {
    return undefined;
  }
  const value = object[path];
  if (value && typeof value === "object" && "get" in value) {
    if (typeof value.get === "function") {
      return value.get();
    } else {
      return value.get;
    }
  } else if (value && typeof value === "function") {
    return value.apply(object);
  } else {
    return value;
  }
}

function collectPaths(fn: Function): string[] {
  const paths: string[] = [];
  // The proxy collects the path navigations that the user's `fn` lambda invokes.
  const proxy = new Proxy(
    {},
    {
      get(object, property, receiver) {
        paths.push(String(property));
        return receiver;
      },
    },
  );
  // Invoke the lens function to record the navigation path on our proxy
  fn(proxy as any);
  return paths;
}

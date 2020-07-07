/** Generically matches on a Reference/Collection's load method. */
type LoadLike<U> = { load(): Promise<U> };

/** Generically matches a property or zero-arg method that returns a promise. */
type PromiseFnLike<U> = () => PromiseLike<U>;

/** Given a parent type U, and a new type V, returns V[] if U is already an array, i.e. we're in flatMap mode. */
type MaybeArray<U, V> = U extends ReadonlyArray<any> ? (V extends ReadonlyArray<any> ? V : V[]) : V;

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
export async function loadLens<T, U, V>(start: T, fn: (lens: Lens<T>) => Lens<U, V>): Promise<V> {
  const paths = collectPaths(fn);
  let current: any = start;
  // Now evaluate each step of the path
  for await (const path of paths) {
    if (Array.isArray(current)) {
      current = (await Promise.all(current.map((c) => maybeLoad(c, path)))).flat();
      current = [...new Set(current)];
    } else {
      current = await maybeLoad(current, path);
    }
  }
  return current!;
}

function maybeLoad(object: any, path: string): unknown {
  if (object === undefined || object === null) {
    return undefined;
  }
  const value = object[path];
  if (value && typeof value === "object" && "load" in value) {
    return value.load();
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
export function getLens<T, U, V>(start: T, fn: (lens: Lens<T>) => Lens<U, V>): V | V[] {
  const paths = collectPaths(fn);
  let current: any = start;
  // Now evaluate each step of the path
  for (const path of paths) {
    if (Array.isArray(current)) {
      current = current.map((c) => maybeGet(c, path)).flat();
      current = [...new Set(current)];
    } else {
      current = maybeGet(current, path);
    }
  }
  return current!;
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

import { Entity } from "./Entity";
import { assertLoaded, Loaded, LoadHint } from "./loadHints";
import { NormalizeHint } from "./normalizeHints";
import {
  isAsyncProperty,
  isLoadedAsyncProperty,
  isLoadedCollection,
  isLoadedReference,
  isReactiveField,
  isReactiveGetter,
  isReactiveQueryField,
  isRelation,
  LoadedCollection,
  LoadedProperty,
  LoadedReadOnlyCollection,
  LoadedReference,
  PolymorphicReference,
} from "./relations";
import { isLoadedReactiveQueryField } from "./relations/ReactiveQueryField";
import { fail, MaybePromise, maybePromiseThen } from "./utils";

// This type seems is overly complex for references, but it's necessary in order to ensure that potential
// undefined references are properly propagated and that polymorphic references don't overwhelm the type system.
export type WithLoaded<
  T extends Entity,
  H /* extends LoadedHint<T> | ReactiveHint<T> is implied but enforced by callers */,
  L = Loaded<T, H>,
> = {
  [K in keyof L as K extends IsWithLoadedKey<T, H, K> ? K : never]: L[K] extends PolymorphicReference<
    T,
    infer U,
    infer N
  >
    ? L[K] extends LoadedReference<T, U, N>
      ? U | N
      : L[K]
    : L[K] extends LoadedReference<T, infer U, never>
      ? U
      : L[K] extends LoadedReference<T, infer U, undefined>
        ? U | undefined
        : L[K] extends LoadedCollection<T, infer U>
          ? U[]
          : L[K] extends LoadedReadOnlyCollection<T, infer U>
            ? // leaving out `readonly U[]` until we're ready to switch
              U[]
            : L[K] extends LoadedProperty<T, infer V>
              ? V
              : L[K];
};

type IsWithLoadedKey<T extends Entity, H, K> = K extends keyof NormalizeHint<H> ? true : false;

/**
 * Allows destructuring against entities to more succinctly access loaded relations.
 *
 * ```typescript
 * // Instead of
 * const author = book.author.get;
 * // Use withLoaded
 * const { author } = withLoaded(book);
 * ```
 *
 * Granted, when accessing one property, this is not a win, but if you're accessing
 * ~3-4 separate loaded properties, then it can be more succinct than using `get`s
 * for each one.
 *
 * This function returns a proxy to an entity, instead of a real entity, and as such its return
 * value should only be used as part of a destructure and never directly assigned to a variable.
 *
 * This is also why the function is not recursive, as returning nested proxies could result in
 * them inadvertently being stored and passed to code that expects a real entity.
 */
export function withLoaded<T extends Entity, const H extends LoadHint<T>>(
  promise: Promise<Loaded<T, H>>,
): Promise<WithLoaded<T, H>>;
export function withLoaded<T extends Entity, const H extends LoadHint<T>>(loaded: Loaded<T, H>): WithLoaded<T, H>;
export function withLoaded<T extends Entity, const H extends LoadHint<T>>(
  maybePromise: MaybePromise<Loaded<T, H>>,
): MaybePromise<WithLoaded<T, H>> {
  return maybePromiseThen(
    maybePromise,
    (loaded) =>
      new Proxy(loaded, {
        get: (target, prop) => {
          const value: any = (target as any)[prop];
          if (
            isRelation(value) ||
            isAsyncProperty(value) ||
            isReactiveField(value) ||
            isReactiveGetter(value) ||
            isReactiveQueryField(value)
          ) {
            return isLoadedReference(value) ||
              isLoadedCollection(value) ||
              isLoadedAsyncProperty(value) ||
              isReactiveField(value) ||
              isLoadedReactiveQueryField(value) ||
              isReactiveGetter(value)
              ? value.get
              : fail(`${target}.${String(prop)} is not loaded`);
          } else if (value instanceof StubbedRelation) {
            return value.get;
          } else {
            return value;
          }
        },
      }) as WithLoaded<T, H>,
  );
}

export function ensureWithLoaded<T extends Entity, const H extends LoadHint<T>>(
  entity: T,
  hint: H,
): WithLoaded<T, H, Loaded<T, H>> {
  assertLoaded<T, H>(entity, hint);
  return withLoaded(entity);
}

/**
 * Allow stubbing of relations with dummy values.
 *
 * In very advanced use cases (ideally only useful in tests, similar to mocking), it can be helpful
 * to have a relation returned a hard-coded value that doesn't go through the normal o2m/m2m
 * .load/.isLoaded/.get code paths.
 *
 * We'd originally done some of this by poking relation internal implementation details, but
 * using private fields like `#loaded` breaks that, and it was brittle anyway.
 *
 * So StubbedRelation provides a semi-blessed way of doing this, i.e. with code like:
 *
 * ```
 * // Force `author.books` to always be `[]` and never load.
 * Object.defineProperty(author, "books", {
 *   get: () => new StubbedRelation([]),
 *  });
 * ```
 */
export class StubbedRelation {
  constructor(private value: any) {}

  get get() {
    return this.value;
  }

  get isLoaded() {
    return true;
  }

  load() {
    return this.get;
  }
}

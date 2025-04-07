import { Entity } from "./Entity";
import { assertLoaded, Loaded, LoadHint } from "./loadHints";
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
  LoadedReference,
  PolymorphicReference,
} from "./relations";
import { isLoadedReactiveQueryField } from "./relations/ReactiveQueryField";
import { fail, MaybePromise, maybePromiseThen } from "./utils";

// This type seems is overly complex for references, but it's necessary in order to ensure that potential
// undefined references are properly propagated and that polymorphic references don't overwhelm the type system.
export type WithLoaded<T extends Entity, H extends LoadHint<T>, L extends Loaded<T, H>> = T & {
  [K in keyof L]: L[K] extends PolymorphicReference<T, infer U, infer N>
    ? L[K] extends LoadedReference<T, U, N>
      ? U | N
      : L[K]
    : L[K] extends LoadedReference<T, infer U, never>
      ? U
      : L[K] extends LoadedReference<T, infer U, undefined>
        ? U | undefined
        : L[K] extends LoadedCollection<T, infer U>
          ? U[]
          : L[K] extends LoadedProperty<T, infer V>
            ? V
            : L[K];
};

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
export function withLoaded<T extends Entity, H extends LoadHint<T>, L extends Loaded<T, H>>(
  promise: Promise<L>,
): Promise<WithLoaded<T, H, L>>;
export function withLoaded<T extends Entity, H extends LoadHint<T>, L extends Loaded<T, H>>(
  loaded: L,
): WithLoaded<T, H, L>;
export function withLoaded<T extends Entity, H extends LoadHint<T>, L extends Loaded<T, H>>(
  loadedOrPromise: MaybePromise<L> | L,
): MaybePromise<WithLoaded<T, H, L>> {
  return maybePromiseThen(
    loadedOrPromise,
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
      }) as WithLoaded<T, H, L>,
  );
}

export function ensureWithLoaded<T extends Entity, H extends LoadHint<T>, L extends Loaded<T, H>>(
  entity: T,
  hint: H,
): WithLoaded<T, H, L> {
  assertLoaded<T, H, L>(entity, hint);
  return withLoaded<T, H, L>(entity);
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

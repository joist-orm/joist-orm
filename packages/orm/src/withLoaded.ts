import { Entity } from "./Entity";
import { assertLoaded, Loaded, LoadHint } from "./loadHints";
import {
  isLoadedAsyncProperty,
  isLoadedCollection,
  isLoadedReference,
  isPersistedAsyncProperty,
  LoadedCollection,
  LoadedProperty,
  LoadedReference,
  PolymorphicReference,
} from "./relations";
import { MaybePromise, maybePromiseThen } from "./utils";

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
          return isLoadedReference(value) ||
            isLoadedCollection(value) ||
            isLoadedAsyncProperty(value) ||
            isPersistedAsyncProperty(value)
            ? value.get
            : value;
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

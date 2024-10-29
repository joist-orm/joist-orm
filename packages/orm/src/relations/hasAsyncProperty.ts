import { currentlyInstantiatingEntity } from "../BaseEntity";
import { Entity } from "../Entity";
import { getMetadata } from "../EntityMetadata";
import { LoadHint, Loaded, isLoaded } from "../loadHints";
import { MaybeReactedPropertyEntity, Reacted, ReactiveHint, convertToLoadHint } from "../reactiveHints";
import { tryResolve } from "../utils";

export const AsyncPropertyT = Symbol();

export interface AsyncProperty<T extends Entity, V> {
  // Differentiate from AsyncMethod
  [AsyncPropertyT]: T;
  isLoaded: boolean;
  load(): Promise<V>;
}

export interface LoadedProperty<T extends Entity, V> {
  get: V;
}

/**
 * Creates a calculated derived value from a load hint + lambda.
 *
 * The property can be accessed by default as a promise, with `someProperty.load()`.
 *
 * But if `someProperty` is used as a populate hint, then it can be accessed synchronously,
 * with `someProperty.get`.
 */
export function hasAsyncProperty<T extends Entity, const H extends LoadHint<T>, V>(
  loadHint: H,
  fn: (entity: Loaded<T, H>) => V,
): AsyncProperty<T, V> {
  const entity = currentlyInstantiatingEntity as T;
  return new AsyncPropertyImpl(entity, loadHint, fn);
}

/**
 * Creates a calculated derived value from a load hint + lambda.
 *
 * The property can be accessed by default as a promise, with `someProperty.load()`.
 *
 * But if `someProperty` is used as a populate hint, then it can be accessed synchronously,
 * with `someProperty.get`.
 */
export function hasReactiveAsyncProperty<T extends Entity, const H extends ReactiveHint<T>, V>(
  reactiveHint: H,
  fn: (entity: Reacted<T, H>) => MaybeReactedPropertyEntity<V>,
): AsyncProperty<T, V> {
  const entity = currentlyInstantiatingEntity as T;
  return new AsyncPropertyImpl(entity, reactiveHint as any, fn as any, { isReactive: true });
}

export class AsyncPropertyImpl<T extends Entity, H extends LoadHint<T>, V> implements AsyncProperty<T, V> {
  // We'll probe for loaded if undefined
  #loaded: boolean | undefined = undefined;
  #loadPromise: any;

  readonly #entity: T;
  #hint: H | undefined;
  #reactiveHint: ReactiveHint<T> | undefined;
  constructor(
    entity: T,
    hint: H | ReactiveHint<T>,
    private fn: (entity: Loaded<T, H>) => V,
    private opts: { isReactive?: boolean } = {},
  ) {
    const { isReactive = false } = opts;
    this.#entity = entity;
    this.#hint = isReactive ? undefined : (hint as H);
    this.#reactiveHint = isReactive ? (hint as ReactiveHint<T>) : undefined;
  }

  load(): Promise<V> {
    if (!this.isLoaded) {
      const { loadHint, fn } = this;
      return (this.#loadPromise ??= this.#entity.em.populate(this.#entity, loadHint).then((loaded) => {
        this.#loaded = true;
        return fn(loaded);
      }));
    }
    return tryResolve(() => this.get);
  }

  get loadHint(): H {
    if (!this.#hint) {
      // Would be nice to statically (but lazily?) cache this...
      this.#hint = convertToLoadHint(getMetadata(this.#entity), this.#reactiveHint as any) as H;
    }
    return this.#hint;
  }

  get reactiveHint(): ReactiveHint<T> | undefined {
    return this.#reactiveHint;
  }

  get get(): V {
    return this.fn(this.#entity as Loaded<T, H>);
  }

  get isLoaded() {
    // Probe the first time, which is useful for factories that are DeepNew
    if (this.#loaded === undefined) {
      this.#loaded = isLoaded(this.#entity, this.loadHint);
    }
    return !!this.#loaded;
  }

  [AsyncPropertyT] = undefined as any as T;
}

/** Type guard utility for determining if an entity field is an AsyncProperty. */
export function isAsyncProperty(maybeAsyncProperty: any): maybeAsyncProperty is AsyncProperty<any, any> {
  return maybeAsyncProperty instanceof AsyncPropertyImpl;
}

/** Type guard utility for determining if an entity field is a loaded AsyncProperty. */
export function isLoadedAsyncProperty(
  maybeAsyncProperty: any,
): maybeAsyncProperty is AsyncProperty<any, any> & LoadedProperty<any, any> {
  return isAsyncProperty(maybeAsyncProperty) && maybeAsyncProperty.isLoaded;
}

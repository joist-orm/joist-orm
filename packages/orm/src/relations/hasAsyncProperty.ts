import { Entity } from "../Entity";
import { Const, currentlyInstantiatingEntity } from "../EntityManager";
import { getMetadata } from "../EntityMetadata";
import { Loaded, LoadHint } from "../loadHints";
import { convertToLoadHint, Reacted, ReactiveHint } from "../reactiveHints";

const I = Symbol();

export interface AsyncProperty<T extends Entity, V> {
  isLoaded: boolean;
  load(): Promise<V>;
  [I]?: T;
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
export function hasAsyncProperty<T extends Entity, H extends LoadHint<T>, V>(
  loadHint: Const<H>,
  fn: (entity: Loaded<T, H>) => V,
): AsyncProperty<T, V> {
  const entity = currentlyInstantiatingEntity as T;
  return new AsyncPropertyImpl(entity, loadHint, undefined, fn);
}

/**
 * Creates a calculated derived value from a load hint + lambda.
 *
 * The property can be accessed by default as a promise, with `someProperty.load()`.
 *
 * But if `someProperty` is used as a populate hint, then it can be accessed synchronously,
 * with `someProperty.get`.
 */
export function hasReactiveAsyncProperty<T extends Entity, H extends ReactiveHint<T>, V>(
  reactiveHint: Const<H>,
  fn: (entity: Reacted<T, H>) => V,
): AsyncProperty<T, V> {
  const entity = currentlyInstantiatingEntity as T;
  return new AsyncPropertyImpl(
    entity,
    convertToLoadHint(getMetadata(entity), reactiveHint as any),
    reactiveHint as any,
    fn as any,
  );
}

export class AsyncPropertyImpl<T extends Entity, H extends LoadHint<T>, V> implements AsyncProperty<T, V> {
  private loaded = false;
  private loadPromise: any;
  readonly #entity: T;
  constructor(
    entity: T,
    public hint: Const<H>,
    public reactiveHint: ReactiveHint<T> | undefined,
    private fn: (entity: Loaded<T, H>) => V,
  ) {
    this.#entity = entity;
  }

  load(): Promise<V> {
    const { hint, fn } = this;
    if (!this.loaded) {
      return (this.loadPromise ??= this.#entity.em.populate(this.#entity, hint).then((loaded) => {
        this.loaded = true;
        return fn(loaded);
      }));
    }
    return Promise.resolve(this.get);
  }

  get get(): V {
    return this.fn(this.#entity as Loaded<T, H>);
  }

  get isLoaded() {
    return this.loaded;
  }
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

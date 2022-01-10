import { currentlyInstantiatingEntity, Entity } from "../EntityManager";
import { getEm } from "../index";
import { Loaded, LoadHint } from "../loaded";

const I = Symbol();

export interface AsyncProperty<T extends Entity, V> {
  loadHint: LoadHint<T>;
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
  loadHint: H,
  fn: (entity: Loaded<T, H>) => V,
): AsyncProperty<T, V> {
  const entity = currentlyInstantiatingEntity as T;
  return new AsyncPropertyImpl(entity, loadHint, fn);
}

export class AsyncPropertyImpl<T extends Entity, H extends LoadHint<T>, V> implements AsyncProperty<T, V> {
  private loaded = false;
  private loadPromise: any;
  constructor(private entity: T, public loadHint: H, private fn: (entity: Loaded<T, H>) => V) {}

  load(): Promise<V> {
    const { entity, loadHint, fn } = this;
    if (!this.loaded) {
      return (this.loadPromise ??= getEm(entity)
        .populate(entity, loadHint)
        .then((loaded) => {
          this.loaded = true;
          return fn(loaded);
        }));
    }
    return Promise.resolve(this.get);
  }

  get get(): V {
    const { entity, fn } = this;
    return fn(entity as Loaded<T, H>);
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

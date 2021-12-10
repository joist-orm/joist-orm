import { Entity, Loaded, LoadHint } from "../EntityManager";
import { getEm } from "../index";

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
  entity: T,
  loadHint: H,
  fn: (entity: Loaded<T, H>) => V,
): AsyncProperty<T, V> {
  return new AsyncPropertyImpl(entity, loadHint, fn);
}

export class AsyncPropertyImpl<T extends Entity, H extends LoadHint<T>, V> implements AsyncProperty<T, V> {
  private loaded = false;
  private loadPromise: any;
  constructor(private entity: T, private loadHint: H, private fn: (entity: Loaded<T, H>) => V) {}

  load(): Promise<V> {
    const { entity, loadHint, fn } = this;
    if (!this.loaded) {
      return this.loadPromise ??= getEm(entity)
        .populate(entity, loadHint)
        .then((loaded) => {
          this.loaded = true;
          return fn(loaded);
        });
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

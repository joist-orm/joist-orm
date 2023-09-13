import { Entity } from "../Entity";
import { currentlyInstantiatingEntity } from "../EntityManager";
import { LoadHint, Loaded } from "../loadHints";

const M = Symbol();

export interface AsyncMethod<T extends Entity, A extends unknown[], V> {
  isLoaded: boolean;
  load(...args: A): Promise<V>;
  [M]?: T;
}

export interface LoadedMethod<T extends Entity, A extends unknown[], V> {
  get(...args: A): V;
}

export function hasAsyncMethod<T extends Entity, const H extends LoadHint<T>, A extends unknown[], V>(
  loadHint: H,
  fn: (entity: Loaded<T, H>, ...args: A) => V,
): AsyncMethod<T, A, V> {
  const entity = currentlyInstantiatingEntity as T;
  return new AsyncMethodImpl(entity, loadHint, fn);
}

export class AsyncMethodImpl<T extends Entity, H extends LoadHint<T>, A extends unknown[], V>
  implements AsyncMethod<T, A, V>
{
  private loaded = false;
  private loadPromise: any;

  readonly #entity: T;
  readonly #hint: H;
  constructor(
    entity: T,
    hint: H,
    private fn: (entity: Loaded<T, H>, ...args: A) => V,
    private opts: { isReactive?: boolean } = {},
  ) {
    const { isReactive = false } = opts;
    this.#entity = entity;
    this.#hint = hint;
  }

  load(...args: A): Promise<V> {
    const { fn } = this;
    if (!this.loaded) {
      return (this.loadPromise ??= this.#entity.em.populate(this.#entity, this.#hint!).then((loaded) => {
        this.loaded = true;
        return fn(loaded, ...args);
      }));
    }
    return Promise.resolve(this.get(...args));
  }

  get(...args: A): V {
    return this.fn(this.#entity as Loaded<T, H>, ...args);
  }

  get isLoaded() {
    return this.loaded;
  }
}

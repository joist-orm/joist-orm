import { currentlyInstantiatingEntity } from "../BaseEntity";
import { Entity } from "../Entity";
import { LoadHint, Loaded, isLoaded } from "../loadHints";
import { tryResolve } from "../utils";

const AsyncMethodM = Symbol();
export const AsyncMethodPopulateSecret = Symbol();

export interface AsyncMethod<T extends Entity, A extends unknown[], V> {
  // To differentiate from AsyncProperties
  [AsyncMethodM]: undefined;
  isLoaded: boolean;
  load(...args: A): Promise<V>;
}

export interface LoadedMethod<T extends Entity, A extends unknown[], V> {
  call(...args: A): V;
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
  ) {
    this.#entity = entity;
    this.#hint = hint;
  }

  /** Args might be either the user-provided args, or the populate `opts` if we're being preloaded. */
  load(...args: A): Promise<V> {
    // Are we being called by `em.populate`? If so, we don't have the real args, so avoid invoking fn
    const isPopulate = args && typeof args[0] === "object" && AsyncMethodPopulateSecret in (args as any)[0];
    const { fn } = this;
    if (!this.loaded) {
      return (this.loadPromise ??= this.#entity.em.populate(this.#entity, this.#hint!).then((loaded) => {
        this.loaded = true;
        return isPopulate ? undefined : fn(loaded, ...args);
      }));
    }
    return isPopulate ? (undefined as any) : tryResolve(() => this.call(...args));
  }

  call(...args: A): V {
    if (!this.isLoaded) {
      throw new Error("hasAsyncMethod.call was called but not loaded");
    }
    return this.fn(this.#entity as Loaded<T, H>, ...args);
  }

  get isLoaded() {
    return this.loaded || isLoaded(this.#entity, this.#hint);
  }

  [AsyncMethodM]: undefined;
}

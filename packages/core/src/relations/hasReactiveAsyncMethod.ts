import type { Entity } from "src/Entity.ts";
import { getEmInternalApi } from "src/EntityManager.ts";
import { getMetadata } from "src/EntityMetadata.ts";
import type { IsLoadedCachable } from "src/loading/IsLoadedCache.ts";
import { isLoaded } from "src/loading/loadHints.ts";
import { lazyField } from "src/newEntity.ts";
import { type Reacted, type ReactiveHint, convertToLoadHint } from "src/reactivity/reactiveHints.ts";
import { type AsyncMethod, AsyncMethodM, AsyncMethodPopulateSecret } from "src/relations/hasAsyncMethod.ts";

/** Creates an explicitly reactive method without memoizing results or running it during flush. */
export function hasReactiveAsyncMethod<T extends Entity, const H extends ReactiveHint<T>, A extends unknown[], V>(
  hint: H,
  fn: (entity: Reacted<T, H>, ...args: A) => V,
  opts?: { onInvalidate?: (entity: T) => void },
): AsyncMethod<T, A, V> {
  return lazyField(
    (entity: T, fieldName) => new ReactiveAsyncMethodImpl(entity, fieldName, hint, fn, opts?.onInvalidate),
  );
}

export class ReactiveAsyncMethodImpl<T extends Entity, H extends ReactiveHint<T>, A extends unknown[], V>
  implements AsyncMethod<T, A, V>, IsLoadedCachable
{
  [AsyncMethodM]: undefined;
  private loaded: boolean | undefined;
  private loadPromise: Promise<unknown> | undefined;

  constructor(
    readonly entity: T,
    readonly fieldName: string,
    readonly reactiveHint: H,
    private fn: (entity: Reacted<T, H>, ...args: A) => V,
    private onInvalidate?: (entity: T) => void,
  ) {}

  /** Loads dependencies without invoking the calculation when called by populate. */
  async load(...args: A): Promise<V> {
    if (!this.isLoaded) {
      this.loadPromise ??= this.entity.em.populate(this.entity, this.loadHint);
      try {
        await this.loadPromise;
      } finally {
        this.loadPromise = undefined;
        this.loaded = undefined;
      }
    }
    const first = args[0];
    const isPopulate = first !== null && typeof first === "object" && AsyncMethodPopulateSecret in first;
    return isPopulate ? (undefined as V) : this.call(...args);
  }

  /** Calculates a result; the caller manages any cached results. */
  call(...args: A): V {
    if (!this.isLoaded) throw new Error("hasReactiveAsyncMethod.call was called but not loaded");
    return this.fn(this.entity as Reacted<T, H>, ...args);
  }

  get isLoaded(): boolean {
    if (this.loaded === undefined) {
      this.loaded = isLoaded(this.entity, this.loadHint);
      getEmInternalApi(this.entity.em).isLoadedCache.add(this);
    }
    return this.loaded;
  }

  /** Clears application state synchronously, before the next calculation or flush. */
  resetIsLoaded(): void {
    this.loaded = undefined;
    this.onInvalidate?.(this.entity);
  }

  private get loadHint() {
    const meta = getMetadata(this.entity);
    return (meta.config.__data.cachedReactiveLoadHints[this.fieldName] ??= convertToLoadHint(meta, this.reactiveHint));
  }
}

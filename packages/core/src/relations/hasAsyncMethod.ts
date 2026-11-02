import { type Entity } from "src/Entity.ts";
import { getEmInternalApi } from "src/EntityManager.ts";
import { getMetadata } from "src/EntityMetadata.ts";
import { type LoadHint, type Loaded, isLoaded } from "src/loading/loadHints.ts";
import { EvaluationSlot } from "src/metrics/EntityMetrics.ts";
import { lazyField } from "src/newEntity.ts";

export const AsyncMethodM = Symbol();
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
  let evaluation: EvaluationSlot | undefined;
  return lazyField((entity: T, fieldName) => {
    evaluation ??= new EvaluationSlot(`${getMetadata(entity).type}.${fieldName}`);
    return new AsyncMethodImpl(entity, loadHint, fn, evaluation);
  });
}

export class AsyncMethodImpl<T extends Entity, H extends LoadHint<T>, A extends unknown[], V> implements AsyncMethod<
  T,
  A,
  V
> {
  private loaded = false;
  private loadPromise: Promise<any> | undefined;

  readonly #entity: T;
  readonly #hint: H;
  constructor(
    entity: T,
    hint: H,
    private fn: (entity: Loaded<T, H>, ...args: A) => V,
    private readonly evaluation: EvaluationSlot,
  ) {
    this.#entity = entity;
    this.#hint = hint;
  }

  /** Args might be either the user-provided args, or the populate `opts` if we're being preloaded. */
  async load(...args: A): Promise<V> {
    // Are we being called by `em.populate`? If so, we don't have the real args, so avoid invoking fn
    const isPopulate = args && typeof args[0] === "object" && AsyncMethodPopulateSecret in (args as any)[0];
    if (!this.loaded) {
      this.loadPromise ??= this.#entity.em.populate(this.#entity, this.#hint!).then((loaded) => (this.loaded = true));
      await this.loadPromise;
    }
    return isPopulate ? (undefined as any) : this.call(...args);
  }

  call(...args: A): V {
    if (!this.isLoaded) {
      throw new Error("hasAsyncMethod.call was called but not loaded");
    }
    const metrics = getEmInternalApi(this.#entity.em).metrics;
    if (!metrics) return this.fn(this.#entity as Loaded<T, H>, ...args);

    const totals = metrics.start(this.evaluation);
    const started = performance.now();
    let value: V;
    try {
      value = this.fn(this.#entity as Loaded<T, H>, ...args);
    } catch (error) {
      metrics.finish(totals, started);
      throw error;
    }
    return metrics.finish(totals, started, value);
  }

  get isLoaded() {
    return this.loaded || isLoaded(this.#entity, this.#hint);
  }

  [AsyncMethodM]: undefined;
}

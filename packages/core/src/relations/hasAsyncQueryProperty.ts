import { Entity } from "../Entity";
import { lazyField } from "../newEntity";
import { AbstractPropertyImpl } from "./AbstractPropertyImpl";
import { AsyncPropertyT } from "./hasAsyncProperty";

export interface AsyncQueryProperty<T extends Entity, V> {
  [AsyncPropertyT]: T;
  isLoaded: boolean;
  load(opts?: { forceReload?: boolean }): Promise<V>;
}

/**
 * Creates a derived value calculated from a SQL query.
 *
 * Unlike `hasAsyncProperty`, the lambda receives the entity and is expected
 * to perform its own SQL queries rather than relying on in-memory graph data.
 *
 * - For new (un-flushed) entities, `load` throws because the entity has no id yet.
 * - The result is cached until the next `em.flush`.
 */
export function hasAsyncQueryProperty<T extends Entity, V>(
  fn: (entity: T) => Promise<V>,
): AsyncQueryProperty<T, V> {
  return lazyField((entity: T) => {
    return new AsyncQueryPropertyImpl(entity, fn);
  });
}

export class AsyncQueryPropertyImpl<T extends Entity, V>
  extends AbstractPropertyImpl<T>
  implements AsyncQueryProperty<T, V>
{
  #loadPromise: Promise<V> | undefined;
  #loaded = false;
  #value: V | undefined;

  constructor(
    entity: T,
    private fn: (entity: T) => Promise<V>,
  ) {
    super(entity);
  }

  load(opts?: { forceReload?: boolean }): Promise<V> {
    if (this.entity.isNewEntity) {
      throw new Error("AsyncQueryProperty cannot be loaded on a new entity that has not been flushed yet");
    }
    if (opts?.forceReload) {
      this.#loadPromise = undefined;
      this.#loaded = false;
    }
    if (this.#loaded) {
      return Promise.resolve(this.#value as V);
    }
    return (this.#loadPromise ??= this.fn(this.entity).then((value) => {
      this.#value = value;
      this.#loaded = true;
      return value;
    }));
  }

  get get(): V {
    if (this.entity.isNewEntity) {
      throw new Error("AsyncQueryProperty cannot be accessed on a new entity that has not been flushed yet");
    }
    if (!this.#loaded) throw new Error("AsyncQueryProperty has not been loaded yet");
    return this.#value as V;
  }

  get isLoaded(): boolean {
    if (this.entity.isNewEntity) return false;
    return this.#loaded;
  }

  /** Called after em.flush to invalidate the cached value. */
  resetAfterFlush(): void {
    this.#loadPromise = undefined;
    this.#loaded = false;
    this.#value = undefined;
  }

  [AsyncPropertyT] = undefined as any as T;
}

/** Type guard utility for determining if an entity field is an AsyncQueryProperty. */
export function isAsyncQueryProperty(maybe: any): maybe is AsyncQueryProperty<any, any> {
  return maybe instanceof AsyncQueryPropertyImpl;
}

/** Type guard utility for determining if an entity field is a loaded AsyncQueryProperty. */
export function isLoadedAsyncQueryProperty(maybe: any): maybe is AsyncQueryProperty<any, any> {
  return isAsyncQueryProperty(maybe) && maybe.isLoaded;
}

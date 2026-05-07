import { Entity } from "../Entity";
import { lazyField } from "../newEntity";
import { AbstractPropertyImpl } from "./AbstractPropertyImpl";
import { Property, PropertyT } from "./hasProperty";

export interface AsyncProperty<T extends Entity, V> extends Property<T, V> {
  load(opts?: { forceReload?: boolean }): Promise<V>;
}

/**
 * Creates a derived value calculated from a SQL query.
 *
 * Unlike `hasProperty`, the lambda receives the entity and is expected
 * to perform its own SQL queries rather than relying on in-memory graph data.
 *
 * - For new (un-flushed) entities, `load` throws because the entity has no id yet.
 * - The result is cached until the next `em.flush`.
 */
export function hasAsyncProperty<T extends Entity, V>(
  fn: (entity: T) => Promise<V>,
): Property<T, V> {
  return lazyField((entity: T) => {
    return new AsyncPropertyImpl(entity, fn);
  });
}

export class AsyncPropertyImpl<T extends Entity, V>
  extends AbstractPropertyImpl<T>
  implements AsyncProperty<T, V>
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
      throw new Error("AsyncProperty cannot be loaded on a new entity that has not been flushed yet");
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
      throw new Error("AsyncProperty cannot be accessed on a new entity that has not been flushed yet");
    }
    if (!this.#loaded) throw new Error("AsyncProperty has not been loaded yet");
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

  [PropertyT] = undefined as any as T;
}

/** Type guard utility for determining if an entity field is an AsyncProperty. */
export function isAsyncProperty(maybe: any): maybe is AsyncProperty<any, any> {
  return maybe instanceof AsyncPropertyImpl;
}

/** Type guard utility for determining if an entity field is a loaded AsyncProperty. */
export function isLoadedAsyncProperty(maybe: any): maybe is AsyncProperty<any, any> {
  return isAsyncProperty(maybe) && maybe.isLoaded;
}

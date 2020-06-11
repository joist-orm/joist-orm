import { Entity } from "../EntityManager";

/**
 * Defines common hooks that relations can respond to to keep the entity graph in sync.
 */
export abstract class AbstractRelationImpl<U> {
  /** Called with the opts from a `new` or `em.create` call, i.e. on a new entity. */
  abstract setFromOpts(value: U): void;

  /** Called on each relation of a new entity, since we know it defacto can be marked as loaded. */
  abstract initializeForNewEntity(): void;

  /** Similar to setFromOpts, but called post-construction. */
  abstract set(value: U): void;

  /** Called on `EntityManager.refresh()` to reload the collection from the latest db values. */
  abstract async refreshIfLoaded(): Promise<void>;

  /**
   * Called when our entity has been `EntityManager.delete`'d _and_ `EntityManager.flush` is being called,
   * so we can unset any foreign keys to the being-deleted entity.
   */
  abstract async onEntityDeletedAndFlushing(): Promise<void>;

  /**
   * Called when our entity has been `EntityManager.delete`'d so that we can run any special behavior
   * like cascades
   */
  abstract onEntityDelete(): void;
}

export type AbstractRelationOpts<T extends Entity, U, N extends never | undefined> = {
  load: (entity: T) => Promise<U | N>;
  onEntityDelete?: (entity: T) => void;
  onEntityDeletedAndFlushing?: (entity: T) => Promise<void>;
  set?: (entity: T, other: U) => void;
  setFromOpts?: (entity: T, other: U) => void;
  refreshIfLoaded?: (entity: T) => Promise<void>;
};

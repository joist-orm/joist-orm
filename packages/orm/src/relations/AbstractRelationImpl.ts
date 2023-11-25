import { Entity } from "../Entity";
import { AbstractPropertyImpl } from "./AbstractPropertyImpl";

/**
 * Defines common hooks that relations can respond to to keep the entity graph in sync.
 */
export abstract class AbstractRelationImpl<
  T extends Entity,
  U extends Entity | Entity[],
> extends AbstractPropertyImpl<T> {
  constructor(entity: T) {
    super(entity);
  }

  /** Called with the opts from a `new` or `em.create` call, i.e. on a new entity. */
  abstract setFromOpts(value: U): void;

  /** Similar to setFromOpts, but called post-construction. */
  abstract set(value: U): void;

  /** Whether this relation is loaded. */
  abstract get isLoaded(): boolean;

  /** Whether this relation is preloaded. */
  abstract get isPreloaded(): boolean;

  /** Loads the other side of this relation. */
  abstract load(opts?: { forceReload?: boolean }): Promise<any>;

  /** Whether the relation from the preload cache, if preloaded. */
  abstract preload(): void;

  /**
   * Called when our entity has been `EntityManager.delete`'d _and_ `EntityManager.flush` is being called,
   * so we can unset any foreign keys to the being-deleted entity and clear out any pointers to it.
   */
  abstract cleanupOnEntityDeleted(): Promise<void>;

  /**
   * Called to cascade deletes into the relation if it has cascade behavior enabled.  This function is called twice,
   * once on the initial `EntityManager.delete` call in a potentially unloaded state, then again from a `beforeDelete`
   * hook after the relation is fully loaded.
   */
  abstract maybeCascadeDelete(): void;
}

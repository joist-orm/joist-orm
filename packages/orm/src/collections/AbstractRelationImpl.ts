import { Entity } from "../EntityManager";

/**
 * Defines common hooks that relations can respond to to keep the entity graph in sync.
 */
export abstract class AbstractRelationImpl<U> {
  abstract onDeleteOfMaybeOtherEntity(maybeOther: Entity): void;

  abstract initializeForNewEntity(): void;

  abstract setFromOpts(value: U): void;

  abstract refreshIfLoaded(): void;

  abstract async onEntityDeletedAndFlushing(): Promise<void>;
}

import { Entity } from "../EntityManager";

/**
 * Defines common hooks that relations can respond to to keep the entity graph in sync.
 */
export abstract class AbstractRelationImpl {
  abstract onDeleteOfMaybeOtherEntity(maybeOther: Entity): void;
}

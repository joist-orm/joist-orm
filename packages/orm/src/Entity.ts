import { EntityManager, OptsOf, TaggedId } from "./EntityManager";
import { BaseEntity, PartialOrNull } from "./index";

export function isEntity(maybeEntity: unknown): maybeEntity is Entity {
  return maybeEntity instanceof BaseEntity;
}

/** All the types we support for entity `id` fields. */
export type IdType = number | string;

/** A marker/base interface for all of our entity types. */
export interface Entity {
  id: IdType;
  idMaybe: IdType | undefined;
  /** The entity id that is always tagged, regardless of the idType config. */
  idTagged: TaggedId;
  idTaggedMaybe: TaggedId | undefined;
  readonly em: EntityManager;
  readonly isNewEntity: boolean;
  readonly isDeletedEntity: boolean;
  readonly isDirtyEntity: boolean;
  set(opts: Partial<OptsOf<this>>): void;
  setPartial(values: PartialOrNull<OptsOf<this>>): void;
  /**
   * Returns `type:id`, i.e. `Author:1` for persisted entities and `Author#1` for new entities.
   *
   * This is meant to be used for developer-facing logging and debugging, and not a user-facing
   * name / display name.
   */
  toString(): string;
}

/**
 * Returns true if the entity is new or was new in this EM.
 *
 * This is primarily used for lazy-initializing relations, i.e. if:
 *
 * - A new `Author` is created
 * - We `em.flush` the author to the database
 * - Then `a1.books` is accessed for the first time
 *
 * We can have a high-confidence that `a1` has no books, because we just
 * created it, so we can set the OneToManyCollection to loaded.
 */
export function isOrWasNew(entity: Entity): boolean {
  return entity.isNewEntity || BaseEntity.getInstanceData(entity).wasNew;
}

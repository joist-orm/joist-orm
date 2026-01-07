import { EntityManager, TaggedId } from "./EntityManager";
import { BaseEntity } from "./index";

export function isEntity(maybeEntity: unknown): maybeEntity is Entity {
  return maybeEntity instanceof BaseEntity;
}

/** All the types we support for entity `id` fields. */
export type IdType = number | string;

/** A marker/base interface for all of our entity types. */
export interface Entity {
  /** The entity id, either tagged or untagged; the per-application `Entity` will specialize appropriately. */
  id: IdType;
  idMaybe: IdType | undefined;
  /** The entity id that is always tagged, regardless of the idType config. */
  idTagged: TaggedId;
  idTaggedMaybe: TaggedId | undefined;
  readonly em: EntityManager;
  readonly isNewEntity: boolean;
  readonly isDeletedEntity: boolean;
  readonly isDirtyEntity: boolean;
  set(opts: unknown): void;
  setPartial(opts: unknown): void;
  setDeepPartial(opts: unknown): Promise<void>;
  /**
   * Returns `type:id`, i.e. `Author:1` for persisted entities and `Author#1` for new entities.
   *
   * Once an entity is persisted, we'll return `Author#1:1` to denote "the previously-new author #1
   * is now authors row id=1 in the database".
   *
   * This is meant to be used for developer-facing logging and debugging, and not a user-facing
   * name / display name.
   */
  toString(): string;
  /**
   * Returns `tag:id`, i.e. `a:1` for persisted entities and `a#1` for new entities.
   *
   * This is meant to be used for developer-facing logging and debugging, and not a user-facing
   * name / display name.
   */
  toTaggedString(): string;
}

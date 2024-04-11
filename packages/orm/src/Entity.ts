import { EntityManager, FieldsOf, OptsOf, TaggedId } from "./EntityManager";
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
  getFieldValue(fieldName: string): unknown;
  setFieldValue(fieldName: string, value: unknown): void;
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

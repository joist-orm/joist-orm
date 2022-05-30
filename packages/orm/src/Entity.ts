import { EntityManager, OptsOf } from "./EntityManager";
import { EntityMetadata } from "./EntityMetadata";
import { PartialOrNull } from "./index";

export function isEntity(maybeEntity: any): maybeEntity is Entity {
  return maybeEntity && typeof maybeEntity === "object" && "id" in maybeEntity && "__orm" in maybeEntity;
}

/** A marker/base interface for all of our entity types. */
export interface Entity {
  /**
   * The entity's primary key, or undefined if it's new.
   *
   * This will be a tagged id, i.e. `a:1`, unless idType is untagged in `joist-codegen.json`.
   */
  id: string | undefined;
  /** The entity id that is always tagged, regardless of the idType config. */
  idTagged: string | undefined;
  idTaggedOrFail: string;
  idOrFail: string;
  /** Joist internal metadata, should be considered a private implementation detail. */
  __orm: EntityOrmField;
  readonly em: EntityManager<any>;
  readonly isNewEntity: boolean;
  readonly isDeletedEntity: boolean;
  readonly isDirtyEntity: boolean;
  readonly isPendingFlush: boolean;
  readonly isPendingDelete: boolean;
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

/** The `__orm` metadata field we track on each instance. */
export interface EntityOrmField {
  /** A point to our entity type's metadata. */
  metadata: EntityMetadata<Entity>;
  /** A bag for our primitives/fk column values. */
  data: Record<any, any>;
  /** A bag to keep the original values, lazily populated. */
  originalData: Record<any, any>;
  /** Whether our entity has been deleted or not. */
  deleted?: "pending" | "deleted";
  /** All entities must be associated to an `EntityManager` to handle lazy loading/etc. */
  em: EntityManager;
  /** Whether our entity is new or not. */
  isNew: boolean;
  /** Whether our entity should flush regardless of any other changes. */
  isTouched: boolean;
}

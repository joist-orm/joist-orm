import { EntityManager, OptsOf, TaggedId } from "./EntityManager";
import { EntityMetadata } from "./EntityMetadata";
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

/** The `#orm` metadata field we track on each instance. */
export class EntityOrmField {
  /** All entities must be associated to an `EntityManager` to handle lazy loading/etc. */
  readonly em: EntityManager;
  /** A point to our entity type's metadata. */
  readonly metadata: EntityMetadata;
  /** A bag for our lazy-initialized relations. */
  relations: Record<any, any> = {};
  /** The database-value of columns, as-is returned from the driver. */
  row!: Record<string, any>;
  /** The domain-value of fields, lazily converted (if needed) on read from the database columns. */
  data: Record<string, any>;
  /** A bag to keep the original values, lazily populated as fields are mutated. */
  originalData: Record<any, any> = {};
  /**
   * Whether our entity has been deleted or not.
   *
   * - `pending` means we've been marked for deletion via `em.delete` but not issued a `DELETE`
   * - `flushed` means we've flushed a `DELETE` but `em.flush` hasn't fully completed yet, likely due to ReactiveQueryField calcs
   * - `deleted` means we've been flushed and `em.flush` has completed
   */
  deleted?: "pending" | "deleted" | "flushed";
  /** Whether our entity is new or not. */
  isNew: boolean = true;
  /** Whether our entity should flush regardless of any other changes. */
  isTouched: boolean = false;
  /** Whether we were created in this EM, even if we've since been flushed. */
  wasNew: boolean = false;

  /** Creates the `#orm` field; defaultValues is only provided when instantiating new entities. */
  constructor(em: EntityManager, metadata: EntityMetadata, isNew: boolean) {
    this.em = em;
    this.metadata = metadata;
    if (isNew) {
      this.isNew = true;
      this.data = {};
      this.row = {};
    } else {
      this.isNew = false;
      this.data = {};
    }
  }

  resetAfterFlushed(isCalculatingReactiveQueryFields: boolean = false) {
    this.originalData = {};
    this.isTouched = false;
    this.wasNew ||= this.isNew;
    this.isNew = false;
    if (this.deleted === "pending" || this.deleted === "flushed") {
      this.deleted = isCalculatingReactiveQueryFields ? "flushed" : "deleted";
    }
  }
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
  return entity.isNewEntity || BaseEntity.getOrmField(entity).wasNew;
}

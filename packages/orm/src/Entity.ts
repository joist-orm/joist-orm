import { EntityManager, OptsOf, TaggedId } from "./EntityManager";
import { EntityMetadata } from "./EntityMetadata";
import { PartialOrNull } from "./index";

export function isEntity(maybeEntity: unknown): maybeEntity is Entity {
  return !!maybeEntity && typeof maybeEntity === "object" && "id" in maybeEntity && "__orm" in maybeEntity;
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
  /** Joist internal metadata, should be considered a private implementation detail. */
  readonly __orm: EntityOrmField;
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

/** The `__orm` metadata field we track on each instance. */
export class EntityOrmField {
  /** All entities must be associated to an `EntityManager` to handle lazy loading/etc. */
  readonly em: EntityManager;
  /** A point to our entity type's metadata. */
  readonly metadata: EntityMetadata;
  /** A bag for our lazy-initialized relations. */
  relations: Record<any, any> = {};
  /** A bag for our primitives/fk column values. */
  data: Record<any, any>;
  /** A bag to keep the original values, lazily populated. */
  originalData: Record<any, any>;
  /** Whether our entity has been deleted or not. */
  deleted?: "pending" | "deleted";
  /** Whether our entity is new or not. */
  isNew: boolean = true;
  /** Whether our entity should flush regardless of any other changes. */
  isTouched: boolean = false;
  /** Whether we were created in this EM, even if we've since been flushed. */
  wasNew: boolean = false;

  constructor(em: EntityManager, metadata: EntityMetadata, defaultValues: Record<any, any>) {
    this.em = em;
    this.metadata = metadata;
    this.data = { ...defaultValues };
    this.originalData = {};
  }

  resetAfterFlushed() {
    this.originalData = {};
    this.isTouched = false;
    this.wasNew ||= this.isNew;
    this.isNew = false;
    if (this.deleted === "pending") {
      this.deleted = "deleted";
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
  return entity.isNewEntity || entity.__orm.wasNew;
}

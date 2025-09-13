import { Entity } from "./Entity";
import { EntityManager, getEmInternalApi } from "./EntityManager";
import { EntityMetadata } from "./EntityMetadata";

/** The `#orm` metadata field we track on each instance. */
export class InstanceData {
  /** All entities must be associated to an `EntityManager` to handle lazy loading/etc. */
  readonly em: EntityManager;
  /** A pointer to our entity type's metadata. */
  readonly metadata: EntityMetadata;
  /** A bag for our lazy-initialized relations. */
  relations: Record<any, any> = {};
  /** The database-value of columns, as-is returned from the driver. */
  row!: Record<string, any>;
  /** The domain-value of fields, lazily converted (if needed) on read from the database columns. */
  data: Record<string, any>;
  /** A bag to keep the original values, lazily populated as fields are mutated. */
  originalData: Record<any, any> = {};
  /** A bag to keep the flushed-to-database values, only for ReactiveQueryField reactivity. */
  flushedData: Record<any, any> | undefined;
  /**
   * Whether our entity has been deleted or not.
   *
   * - `pending` means we've been marked for deletion via `em.delete` but not issued a `DELETE`
   * - `flushed` means we've flushed a `DELETE` but `em.flush` hasn't fully completed yet, likely due to ReactiveQueryField calcs
   * - `deleted` means we've been flushed and `em.flush` has completed
   */
  #deleted?: Operation;
  /** Whether our entity is new or not. */
  #new?: Operation;
  /** Whether our entity should flush regardless of any other changes. */
  isTouched: boolean = false;

  /** Creates the `#orm` field. */

  constructor(em: EntityManager, metadata: EntityMetadata, isNew: boolean) {
    this.em = em;
    this.metadata = metadata;
    if (isNew) {
      this.#new = Operation.Pending;
      this.data = {};
      this.row = {};
      this.flushedData = undefined;
    } else {
      this.#new = undefined;
      this.data = {};
      this.flushedData = undefined;
    }
  }

  /** If `em.flush` has detected a dirty RQF, reset our internal dirty state, w/o reseting our external-dirty state. */
  resetForRqfLoop() {
    this.flushedData = {};
    if (this.#new === Operation.Pending) this.#new = Operation.Flushed;
    if (this.#deleted === Operation.Pending) this.#deleted = Operation.Flushed;
  }

  resetAfterFlushed() {
    this.originalData = {};
    this.flushedData = undefined;
    this.isTouched = false;
    if (this.#new === Operation.Pending || this.#new === Operation.Flushed) {
      this.#new = Operation.Complete;
    }
    if (this.#deleted === Operation.Pending || this.#deleted === Operation.Flushed) {
      this.#deleted = Operation.Complete;
    }
  }

  /** Our public-facing `isNewEntity`. */
  get isNewEntity(): boolean {
    return this.#new !== undefined && this.#new !== Operation.Complete;
  }

  /** Our public-facing `isDeletedEntity`. */
  get isDeletedEntity(): boolean {
    return this.#deleted !== undefined;
  }

  /** Our public-facing `isDirtyEntity`. */
  get isDirtyEntity(): boolean {
    return Object.keys(this.originalData).length > 0;
  }

  /** This is our internal "is pending flush", which is aware of RQF micro-flush loops. */
  get pendingOperation(): "insert" | "update" | "delete" | "none" | "created-then-deleted" {
    if (this.#deleted !== undefined) {
      // Mark entities that were created and them immediately `em.delete`-d; granted this is
      // probably rare, but we shouldn't run hooks or have the driver try and delete these.
      // Note that we return them, instead of skipping entirely, so that fixupCreatedThenDeleted
      // can later be called.
      return this.#deleted === Operation.Pending && this.#new === Operation.Pending
        ? "created-then-deleted"
        : this.#deleted === Operation.Pending
          ? "delete"
          : "none";
    } else if (this.#new === Operation.Pending) {
      // Per ^, if `#new === flushed`, we fall through to check if micro-flush UPDATEs are required
      return "insert";
    } else if (this.flushedData) {
      return Object.keys(this.flushedData).length > 0 ? "update" : "none";
    } else {
      return this.isTouched || Object.keys(this.originalData).length > 0 ? "update" : "none";
    }
  }

  get changedFields(): string[] {
    return this.flushedData ? Object.keys(this.flushedData) : Object.keys(this.originalData);
  }

  /** Called when an `em.load` tries to find the entity and it's just gone from the db. */
  markDeletedBecauseNotFound(): void {
    this.#deleted = Operation.Complete;
  }

  /** Called by `em.delete`, returns true if this is new information. */
  markDeleted(entity: Entity): boolean {
    if (this.#deleted === undefined) {
      // Let any OneToManyCollection.get caches know that they should recalc (i.e. their filterDeleted logic)
      // by asserting the `deleteBook.author` field is changing.
      //
      // Technically, the o2m caches use the "naive" cache, so we don't really need to pass along the field.
      for (const field of Object.values(this.metadata.allFields)) {
        if (field.kind === "m2o") {
          getEmInternalApi(this.em).isLoadedCache.resetIsLoaded(entity, field.fieldName);
        }
      }
      this.#deleted = Operation.Pending;
      return true;
    }
    return false;
  }

  fixupCreatedThenDeleted(): void {
    // Ideally we could do this via `resetAfterFlushed`?
    this.#deleted = Operation.Complete;
  }

  get isDeletedAndFlushed(): boolean {
    return this.#deleted === Operation.Complete;
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
  get isOrWasNew(): boolean {
    // #new will be left as `complete`
    return this.#new !== undefined;
  }
}

/** An enum to track our insert/delete state progression. */
enum Operation {
  Pending = 1,
  Flushed = 2,
  Complete = 3,
}

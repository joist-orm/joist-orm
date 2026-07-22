import { Entity } from "./Entity";
import { EntityManager, getEmInternalApi } from "./EntityManager";
import { EntityMetadata } from "./EntityMetadata";
import { emptyRowData, RowData } from "./RowData";
import { hasAnyKey } from "./utils";

/** The `#orm` metadata field we track on each instance. */
export class InstanceData {
  /** The entity this instance data belongs to. */
  readonly entity: Entity;
  /** All entities must be associated to an `EntityManager` to handle lazy loading/etc. */
  readonly em: EntityManager;
  /** A pointer to our entity type's metadata. */
  readonly metadata: EntityMetadata;
  /** A bag for our lazy-initialized relations, allocated on first relation access. */
  relations: Record<any, any> | undefined = undefined;
  /** The as-loaded database row, i.e. our `rowIndex`-th row within our query's `RowData` result. */
  rowData: RowData = emptyRowData;
  /** Our row's index within `rowData`; see {@link RowData}. */
  rowIndex: number = 0;

  /**
   * A compat view of the as-loaded database row as a POJO.
   *
   * @deprecated Prefer `rowData`/`rowIndex`; this materializes the row on every access (it was
   * previously the raw driver row object).
   */
  get row(): Record<string, any> {
    return this.rowData.toRow(this.rowIndex);
  }
  /** The domain-value of fields, lazily converted (if needed) on read from the database columns. */
  data: Record<string, any>;
  /** A bag to keep the original values, allocated on first mutation (most entities are never mutated). */
  #originalData: Record<any, any> | undefined = undefined;
  /** Reference values that were set during this unit of work, allocated on first m2o/poly change. */
  #referenceHistory: Record<string, any[]> | undefined = undefined;
  /** A bag to keep the flushed-to-database values, only for AsyncReactiveField reactivity. */
  flushedData: Record<any, any> | undefined;
  /** Packs the new/deleted `Operation`s + isTouched into one slot; see the accessors below. */
  #flags: number = 0;
  /** The `a#1`, `a#2` index if we're an em.create-d entity. We never unset this, to keep ids stable across flushes. */
  createId: string | undefined;
  /** The zero-based order this entity was registered with its EntityManager. */
  entityIndex: number = -1;

  /** Whether our entity is new or not. */
  get #new(): Operation | undefined {
    const value = this.#flags & 0b11;
    return value === 0 ? undefined : value;
  }

  set #new(op: Operation | undefined) {
    this.#flags = (this.#flags & ~0b11) | (op ?? 0);
  }

  /**
   * Whether our entity has been deleted or not.
   *
   * - `pending` means we've been marked for deletion via `em.delete` but not issued a `DELETE`
   * - `flushed` means we've flushed a `DELETE` but `em.flush` hasn't fully completed yet, likely due to AsyncReactiveField calcs
   * - `deleted` means we've been flushed and `em.flush` has completed
   */
  get #deleted(): Operation | undefined {
    const value = (this.#flags >> 2) & 0b11;
    return value === 0 ? undefined : value;
  }

  set #deleted(op: Operation | undefined) {
    this.#flags = (this.#flags & ~0b1100) | ((op ?? 0) << 2);
  }

  /** Whether our entity should flush regardless of any other changes. */
  get isTouched(): boolean {
    return (this.#flags & 0b10000) !== 0;
  }

  set isTouched(value: boolean) {
    this.#flags = value ? this.#flags | 0b10000 : this.#flags & ~0b10000;
  }

  /** Creates the `#orm` field. */
  constructor(em: EntityManager, entity: Entity, metadata: EntityMetadata, isNew: boolean) {
    this.entity = entity;
    this.em = em;
    this.metadata = metadata;
    if (isNew) {
      this.#new = Operation.Pending;
      this.data = {};
      this.flushedData = undefined;
      if (em) this.markMaybePending();
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
    this.#originalData = undefined;
    this.#referenceHistory = undefined;
    this.flushedData = undefined;
    this.isTouched = false;
    if (this.#new === Operation.Pending || this.#new === Operation.Flushed) {
      this.#new = Operation.Complete;
    }
    if (this.#deleted === Operation.Pending || this.#deleted === Operation.Flushed) {
      this.#deleted = Operation.Complete;
    }
    this.unmarkMaybePending();
  }

  /** Our public-facing `isNewEntity`. */
  get isNewEntity(): boolean {
    return this.#new !== undefined && this.#new !== Operation.Complete;
  }

  /** Our public-facing `isDeletedEntity`. */
  get isDeletedEntity(): boolean {
    return this.#deleted !== undefined;
  }

  /** The original values of mutated fields; a shared empty object until the entity is actually mutated. */
  get originalData(): Record<any, any> {
    return this.#originalData ?? emptyObject;
  }

  /** Our public-facing `isDirtyEntity`. */
  get isDirtyEntity(): boolean {
    return hasAnyKey(this.#originalData);
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
      return hasAnyKey(this.flushedData) ? "update" : "none";
    } else {
      return this.isTouched || hasAnyKey(this.#originalData) ? "update" : "none";
    }
  }

  get changedFields(): string[] {
    return Object.keys(this.changedData);
  }

  /** The changed-fields bag (flushedData during RQF loops, else originalData) without allocating a keys array. */
  get changedData(): Record<any, any> {
    return this.flushedData ?? this.#originalData ?? emptyObject;
  }

  /** Called when an `em.load` tries to find the entity and it's just gone from the db. */
  markDeletedBecauseNotFound(): void {
    this.#deleted = Operation.Complete;
  }

  /** Called by `em.delete`, returns true if this is new information. */
  markDeleted(): boolean {
    if (this.#deleted === undefined) {
      // Let any OneToManyCollection/ReactiveField/ReactiveReference.get caches know that they should recalc
      // (i.e. their filterDeleted logic) by asserting the `deleteBook.author` field is changing.
      for (const field of Object.values(this.metadata.allFields)) {
        // We only do reference/collection fields and skip the primitives, b/c we assume something like
        // `{ books: "title" }` doesn't need `resetIsLoaded(..., "title")` b/c the same hint will also
        // be watching "did books change", and so get reset that way.
        if (field.kind === "m2o" || field.kind === "poly" || field.kind === "m2m" || field.kind === "m2mEnum") {
          getEmInternalApi(this.em).isLoadedCache.resetIsLoaded(this.entity, field.fieldName);
        } else if (field.kind === "primitive" || field.kind === "enum" || field.kind === "primaryKey") {
          // Any reactable watching these fields will also be watching reference/collection
        } else if (field.kind === "o2m" || field.kind === "o2o") {
          // Any reactable watching these actually gets triggered by the primary m2o/poly side changing
        } else if (field.kind === "lo2m") {
          // Doesn't support reactivity
        } else {
          throw new Error(`Unhandled field kind ${field}`);
        }
      }
      this.#deleted = Operation.Pending;
      this.markMaybePending();
      return true;
    }
    return false;
  }

  fixupCreatedThenDeleted(): void {
    // Ideally we could do this via `resetAfterFlushed`?
    this.#deleted = Operation.Complete;
    this.unmarkMaybePending();
  }

  /** Marks this entity as needing a flush even if no fields changed. */
  markTouched(): void {
    this.isTouched = true;
    this.markMaybePending();
  }

  /** Marks a field as dirty with its pre-mutation value. */
  markFieldDirty(fieldName: string, value: any): void {
    (this.#originalData ??= {})[fieldName] = value;
    this.markMaybePending();
  }

  /** Marks a reverted field as clean again. */
  markFieldClean(fieldName: string): void {
    if (this.#originalData) delete this.#originalData[fieldName];
    this.markMaybePending();
  }

  /** Marks this entity as a possible flush candidate. */
  markMaybePending(): void {
    getEmInternalApi(this.em).markMaybePending(this.entity);
  }

  /** Removes this entity from the possible flush candidate set. */
  private unmarkMaybePending(): void {
    getEmInternalApi(this.em).unmarkMaybePending(this.entity);
  }

  /** Remembers a reference value that may need to be reverse-walked later. */
  rememberReferenceValue(fieldName: string, value: any): void {
    if (value === undefined) return;
    const values = ((this.#referenceHistory ??= {})[fieldName] ??= []);
    if (!values.includes(value)) values.push(value);
  }

  /** Returns reference values that may need to be reverse-walked later. */
  getReferenceHistory(fieldName: string): readonly any[] {
    return this.#referenceHistory?.[fieldName] ?? emptyArray;
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

/** A shared frozen bag for un-mutated entities; strict mode makes accidental writes throw. */
const emptyObject: Record<any, any> = Object.freeze({});

/** A shared frozen array for fields with no remembered reference values. */
const emptyArray: readonly any[] = Object.freeze([]);

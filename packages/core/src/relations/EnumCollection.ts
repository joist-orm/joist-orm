import {
  appendStack,
  ensureNotDeleted,
  Entity,
  EntityMetadata,
  getEmInternalApi,
  getInstanceData,
  getMetadata,
  getMetadataForField,
  ManyToManyEnumField,
  ManyToManyLike,
} from "../";
import { enumCollectionBatchLoader } from "../batchloaders/enumCollectionBatchLoader";
import { EnumMetadata } from "../EnumMetadata";
import { lazyField } from "../newEntity";
import { remove } from "../utils";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { RelationT, RelationU } from "./Relation";

/** A nominal brand so `EnumCollection` is not structurally confused with a regular `Collection`. */
declare const enumCollectionTag: unique symbol;

/**
 * A collection of enum codes `E` within `T`, backed by a m2m join table to an enum "table".
 *
 * To the user it looks like an array of enum codes (e.g. `Color[]`), but unlike an enum-array
 * column it is lazy and so needs a load hint, like any other relation.
 */
export interface EnumCollection<T extends Entity, E> {
  [enumCollectionTag]: true;
  [RelationT]: T;
  [RelationU]: E;

  load(opts?: { forceReload?: boolean }): Promise<ReadonlyArray<E>>;

  add(code: E): void;

  remove(code: E): void;

  /**
   * Sets the collection to `codes`.
   *
   * Can be called on unloaded collections - the diff will be resolved at load or flush time.
   */
  set(codes: readonly E[]): void;

  includes(code: E): Promise<boolean>;

  readonly isLoaded: boolean;
  readonly entity: Entity;
  readonly hasBeenSet: boolean;
}

/** Adds a known-safe `get` accessor. */
export interface LoadedEnumCollection<T extends Entity, E> extends EnumCollection<T, E> {
  get: ReadonlyArray<E>;

  removeAll(): void;
}

/** An alias for creating `EnumCollection`s. */
export function hasEnumCollection<T extends Entity, E>(): EnumCollection<T, E> {
  return lazyField((entity: T, fieldName) => {
    const field = getMetadata(entity).allFields[fieldName] as ManyToManyEnumField;
    return new EnumCollectionImpl<T, E>(entity, field);
  });
}

export class EnumCollectionImpl<T extends Entity, E>
  extends AbstractRelationImpl<T, E[]>
  implements EnumCollection<T, E>, LoadedEnumCollection<T, E>, ManyToManyLike
{
  readonly #field: ManyToManyEnumField;
  #loaded: boolean;
  #loadPromise: any;
  #hasBeenSet = false;
  /** Holds a pending `set()` when called on an unloaded collection, resolved at load. */
  #pendingSet: E[] | undefined;

  constructor(entity: T, field: ManyToManyEnumField) {
    super(entity);
    this.#field = field;
    this.#loaded = getInstanceData(entity).isOrWasNew;
  }

  async load(opts: { forceReload?: boolean } = {}): Promise<ReadonlyArray<E>> {
    ensureNotDeleted(this.entity, "pending");
    if (!this.#loaded || (opts.forceReload && !this.entity.isNewEntity)) {
      if (this.#getPreloaded() !== undefined) {
        this.#loaded = true;
      } else {
        await (this.#loadPromise ??= enumCollectionBatchLoader(this.entity.em, this).load(this.entity.idTagged!))
          .then(() => {
            this.#loaded = true;
          })
          .catch(function load(err: any) {
            throw appendStack(err, new Error());
          })
          .finally(() => {
            this.#loadPromise = undefined;
          });
      }
      if (this.#pendingSet) {
        const pending = this.#pendingSet;
        this.#pendingSet = undefined;
        this.#applySet(pending);
      }
    }
    return this.get;
  }

  add(code: E): void {
    ensureNotDeleted(this.entity);
    if (this.#pendingSet) {
      if (!this.#pendingSet.includes(code)) this.#pendingSet.push(code);
      return;
    }
    if (this.#loaded && this.get.includes(code)) return;
    this.#joinRows.addNew(this, this.entity, this.#idOf(code));
  }

  remove(code: E): void {
    ensureNotDeleted(this.entity, "pending");
    if (this.#pendingSet) {
      remove(this.#pendingSet, code);
      return;
    }
    this.#joinRows.addRemove(this, this.entity, this.#idOf(code));
  }

  set(codes: readonly E[]): void {
    ensureNotDeleted(this.entity);
    this.#hasBeenSet = true;
    if (!this.#loaded) {
      this.#pendingSet = [...codes];
      getEmInternalApi(this.entity.em).pendingLoads.add(this as any);
      return;
    }
    this.#applySet(codes);
  }

  async includes(code: E): Promise<boolean> {
    ensureNotDeleted(this.entity, "pending");
    if (this.#pendingSet) return this.#pendingSet.includes(code);
    if (this.#loaded) return this.get.includes(code);
    if (this.entity.isNewEntity) return false;
    await this.load();
    return this.get.includes(code);
  }

  removeAll(): void {
    ensureNotDeleted(this.entity);
    if (!this.#loaded) throw new Error("removeAll was called when not loaded");
    for (const code of [...this.get]) this.remove(code);
  }

  get get(): E[] {
    ensureNotDeleted(this.entity, "pending");
    if (!this.#loaded) {
      throw new Error(`${this.entity}.${this.fieldName}.get was called when not loaded`);
    }
    return this.#codesFor(this.entity);
  }

  get isLoaded(): boolean {
    return this.#loaded;
  }

  get isPreloaded(): boolean {
    return this.#getPreloaded() !== undefined;
  }

  preload(): void {
    if (this.#getPreloaded() !== undefined) this.#loaded = true;
  }

  setFromOpts(codes: E[]): void {
    this.#loaded = true;
    for (const code of codes ?? []) this.add(code);
  }

  /**
   * Mirrors `other`'s codes into us for `em.fork`/`importEntity`.
   *
   * Enum codes have no entity identity to remap, and we copy them as already-persisted rows (not
   * pending adds) so the receiving em doesn't think it has spurious inserts to flush.
   */
  import(other: EnumCollectionImpl<T, E>): void {
    if (!other.isLoaded) return;
    this.#loaded = true;
    for (const code of other.get) {
      this.#joinRows.addPreloadedRow(this, undefined, this.entity, this.#idOf(code));
    }
  }

  maybeCascadeDelete(): void {
    // The join table FK cascades on the db side, so there's nothing to cascade in memory.
  }

  async cleanupOnEntityDeleted(): Promise<void> {
    // The db cascade-deletes our join rows, so just drop any pending in-memory changes for us.
    this.#joinRows.removeAllFor(this.columnName, this.entity);
  }

  get fieldName(): string {
    return this.#field.fieldName;
  }

  get hasBeenSet(): boolean {
    return this.#hasBeenSet;
  }

  toString(): string {
    return `EnumCollection(entity: ${this.entity}, fieldName: ${this.fieldName}, enum: ${this.#field.enumDetailType.name})`;
  }

  #applySet(codes: readonly E[]): void {
    const current = this.get;
    for (const code of current) if (!codes.includes(code)) this.remove(code);
    for (const code of codes) if (!current.includes(code)) this.add(code);
  }

  /** The current (non-deleted) codes for `entity`, sorted by enum id for a stable order. */
  #codesFor(entity: Entity): E[] {
    return (this.#joinRows.getOthers(this.columnName, entity) as number[])
      .sort((a, b) => a - b)
      .map((id) => this.#field.enumDetailType.findById(id)!.code as E);
  }

  #idOf(code: E): number {
    return this.#field.enumDetailType.getByCode(code).id;
  }

  #getPreloaded(): E[] | undefined {
    if (this.entity.isNewEntity) return undefined;
    return getEmInternalApi(this.entity.em).getPreloadedRelation<E>(this.entity.idTagged, this.fieldName);
  }

  get #joinRows() {
    return getEmInternalApi(this.entity.em).joinRows(this);
  }

  // The `ManyToManyLike` surface, so JoinRows/batch loaders can use us directly. There is no
  // `otherMeta`/`otherFieldName` because the "other" side is an enum table, not an entity.

  get joinTableName(): string {
    return this.#field.joinTableName;
  }

  get columnName(): string {
    return this.#field.columnNames[0];
  }

  get otherColumnName(): string {
    return this.#field.columnNames[1];
  }

  get meta(): EntityMetadata {
    return getMetadataForField(getMetadata(this.entity), this.#field.fieldName);
  }

  get otherEnum(): EnumMetadata<any, any, number> {
    return this.#field.enumDetailType;
  }

  get otherMeta(): undefined {
    return undefined;
  }

  get otherFieldName(): undefined {
    return undefined;
  }

  get hasJoinTableId(): boolean {
    return this.#field.hasJoinTableId;
  }

  declare [enumCollectionTag]: true;
  [RelationT]: T = null!;
  [RelationU]: E = null!;
}

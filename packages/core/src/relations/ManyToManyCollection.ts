import {
  appendStack,
  Collection,
  ensureNotDeleted,
  Entity,
  EntityMetadata,
  getEmInternalApi,
  getInstanceData,
  getMetadata,
  IdOf,
  ManyToManyField,
  toTaggedId,
} from "../";
import { manyToManyDataLoader } from "../dataloaders/manyToManyDataLoader";
import { manyToManyFindDataLoader } from "../dataloaders/manyToManyFindDataLoader";
import { lazyField } from "../newEntity";
import { maybeAdd, maybeRemove, remove } from "../utils";
import { AbstractRelationImpl, isCascadeDelete } from "./AbstractRelationImpl";
import { RelationT, RelationU } from "./Relation";

/** An alias for creating `ManyToManyCollections`s. */
export function hasManyToMany<T extends Entity, U extends Entity>(): Collection<T, U> {
  return lazyField((entity: T, fieldName) => {
    const m2m = getMetadata(entity).allFields[fieldName] as ManyToManyField;
    return new ManyToManyCollection<T, U>(entity, m2m);
  });
}

export class ManyToManyCollection<T extends Entity, U extends Entity>
  extends AbstractRelationImpl<T, U[]>
  implements Collection<T, U>
{
  readonly #field: ManyToManyField;
  #loaded: U[] | undefined;
  #addedBeforeLoaded: U[] | undefined;
  #removedBeforeLoaded: U[] | undefined;
  #pendingSet: U[] | undefined;
  #hasBeenSet = false;

  // I.e. when entity = Book:
  // fieldName == tags, because it's our collection to tags
  // columnName = book_id, what we use as the `where book_id = us` to find our join table rows
  // otherFieldName = books, how tags points to us
  // otherColumnName = tag_id, how the other side finds its join table rows
  constructor(entity: T, field: ManyToManyField) {
    super(entity);
    this.#field = field;
    if (getInstanceData(entity).isOrWasNew) {
      this.#loaded = [];
    }
  }

  /** Removes pending-hard-delete or soft-deleted entities, unless explicitly asked for. */
  private filterDeleted(entities: U[], opts?: { withDeleted?: boolean }): U[] {
    return opts?.withDeleted === true
      ? [...entities]
      : entities.filter((e) => !e.isDeletedEntity && !(e as any).isSoftDeletedEntity);
  }

  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<ReadonlyArray<U>> {
    ensureNotDeleted(this.entity, "pending");
    if (this.#loaded === undefined || (opts.forceReload && !this.entity.isNewEntity)) {
      const key = `${this.columnName}=${this.entity.id}`;
      this.#loaded =
        this.#getPreloaded() ??
        (await manyToManyDataLoader(this.entity.em, this)
          .load(key)
          .catch(function load(err) {
            throw appendStack(err, new Error());
          }));
      this.maybeApplyAddedAndRemovedBeforeLoaded();
    }
    return this.filterDeleted(this.#loaded!, opts) as ReadonlyArray<U>;
  }

  async find(id: IdOf<U>): Promise<U | undefined> {
    ensureNotDeleted(this.entity, "pending");
    if (this.#loaded !== undefined) {
      return this.#loaded.find((u) => u.id === id);
    } else {
      const added = this.#addedBeforeLoaded?.find((u) => u.id === id);
      if (added) {
        return added;
      }
      // Make a cacheable tuple to look up this specific m2m row
      const key = `${this.columnName}=${this.entity.id},${this.otherColumnName}=${id}`;
      const includes = await manyToManyFindDataLoader(this.entity.em, this)
        .load(key)
        .catch(function load(err) {
          throw appendStack(err, new Error());
        });
      const taggedId = toTaggedId(this.otherMeta, id);
      return includes ? (this.entity.em.load(taggedId) as Promise<U>) : undefined;
    }
  }

  async includes(other: U): Promise<boolean> {
    ensureNotDeleted(this.entity, "pending");
    if (this.#loaded !== undefined) {
      return this.#loaded.includes(other);
    } else {
      if (this.#addedBeforeLoaded?.includes(other)) {
        return true;
      } else if (other.isNewEntity) {
        return false;
      }
      // Make a cacheable tuple to look up this specific m2m row
      const key = `${this.columnName}=${this.entity.id},${this.otherColumnName}=${other.id}`;
      return manyToManyFindDataLoader(this.entity.em, this)
        .load(key)
        .catch(function includes(err) {
          throw appendStack(err, new Error());
        });
    }
  }

  add(other: U, percolated = false): void {
    ensureNotDeleted(this.entity);
    if (this.#loaded !== undefined) {
      if (this.#loaded.includes(other)) return;
      this.#loaded.push(other);
    } else if (this.#pendingSet !== undefined) {
      if (!this.#pendingSet.includes(other)) this.#pendingSet.push(other);
    } else {
      if (this.#removedBeforeLoaded) remove(this.#removedBeforeLoaded, other);
      if (!(this.#addedBeforeLoaded ??= []).includes(other)) this.#addedBeforeLoaded.push(other);
    }
    if (!percolated) {
      getEmInternalApi(this.entity.em).joinRows(this).addNew(this, this.entity, other);
      (other[this.otherFieldName] as any as ManyToManyCollection<U, T>).add(this.entity, true);
    }
  }

  remove(other: U, percolated = false): void {
    ensureNotDeleted(this.entity, "pending");
    if (!percolated) {
      getEmInternalApi(this.entity.em).joinRows(this).addRemove(this, this.entity, other);
      (other[this.otherFieldName] as any as ManyToManyCollection<U, T>).remove(this.entity, true);
    }
    if (this.#pendingSet !== undefined) {
      remove(this.#pendingSet, other);
    } else if (this.#loaded !== undefined) {
      remove(this.#loaded, other);
    } else {
      maybeRemove(this.#addedBeforeLoaded, other);
      maybeAdd((this.#removedBeforeLoaded ??= []), other);
    }
  }

  get isLoaded(): boolean {
    return this.#loaded !== undefined;
  }

  get isPreloaded(): boolean {
    return !!this.#getPreloaded();
  }

  preload(): void {
    this.#loaded = this.#getPreloaded();
    this.maybeApplyAddedAndRemovedBeforeLoaded();
  }

  import(other: ManyToManyCollection<T, U>, _: unknown, mapEntities: (e: U[] | undefined) => U[] | undefined): void {
    this.#loaded = mapEntities(other.#loaded);
    this.#addedBeforeLoaded = mapEntities(other.#addedBeforeLoaded);
    this.#removedBeforeLoaded = mapEntities(other.#removedBeforeLoaded);
    this.#pendingSet = mapEntities(other.#pendingSet);
  }

  private doGet(): U[] {
    ensureNotDeleted(this.entity, "pending");
    if (this.#pendingSet !== undefined) {
      return this.#pendingSet;
    }
    if (this.#loaded === undefined) {
      // This should only be callable in the type system if we've already resolved this to an instance
      throw new Error(`${this.entity}.${this.fieldName}.get was called when not loaded`);
    }
    return this.#loaded;
  }

  get getWithDeleted(): U[] {
    return this.filterDeleted(this.doGet(), { withDeleted: true });
  }

  get get(): U[] {
    return this.filterDeleted(this.doGet(), { withDeleted: false });
  }

  set(values: readonly U[]): void {
    ensureNotDeleted(this.entity);
    this.#hasBeenSet = true;
    if (this.#loaded === undefined) {
      // Store the pending set for later resolution at flush or load time
      this.#pendingSet = [...values];
      // Clear any prior add/remove tracking since set supersedes them
      this.#addedBeforeLoaded = undefined;
      this.#removedBeforeLoaded = undefined;
      // Mark our JoinRows as needing to load this m2m before flush
      getEmInternalApi(this.entity.em).joinRows(this).markPendingSet(this);
    } else {
      // Make a copy for safe iteration
      const loaded = new Set([...this.#loaded]);
      // Remove old values
      const valuesSet = new Set(values);
      for (const other of loaded) {
        if (!valuesSet.has(other)) this.remove(other);
      }
      // Add new values
      for (const other of values) {
        if (!loaded.has(other)) this.add(other);
      }
    }
  }

  removeAll(): void {
    ensureNotDeleted(this.entity);
    if (this.#loaded === undefined) {
      throw new Error("removeAll was called when not loaded");
    }
    for (const other of [...this.#loaded]) {
      this.remove(other);
    }
  }

  // impl details

  setFromOpts(others: U[]): void {
    this.#loaded = [];
    others.forEach((o) => this.add(o));
  }

  maybeCascadeDelete() {
    if (this.#isCascadeDelete) {
      this.#current({ withDeleted: true }).forEach((e) => this.entity.em.delete(e));
    }
  }

  async cleanupOnEntityDeleted(): Promise<void> {
    // if we are going to delete this relation as well, then we don't need to clean it up
    if (this.#isCascadeDelete) return;
    const entities = await this.load({ withDeleted: true });
    entities.forEach((other) => {
      const m2m = other[this.otherFieldName] as any as ManyToManyCollection<U, T>;
      m2m.remove(this.entity);
    });
    this.#loaded = [];
  }

  private maybeApplyAddedAndRemovedBeforeLoaded(): void {
    if (this.#loaded) {
      // If there's a pending set, apply it now that we're loaded
      if (this.#pendingSet !== undefined) {
        const pending = this.#pendingSet;
        this.#pendingSet = undefined;
        // Remove entities not in the pending set
        for (const other of [...this.#loaded]) {
          if (!pending.includes(other)) this.remove(other);
        }
        // Add entities from the pending set not already loaded
        for (const other of pending) {
          if (!this.#loaded.includes(other)) this.add(other);
        }
        return;
      }
      this.#addedBeforeLoaded?.forEach((e) => {
        if (!this.#loaded?.includes(e)) {
          // Push on the end to better match the db order of "newer things come last"
          this.#loaded?.unshift(e);
          getEmInternalApi(this.entity.em).joinRows(this).addNew(this, this.entity, e);
        }
      });
      this.#removedBeforeLoaded?.forEach((e) => {
        remove(this.#loaded!, e);
        getEmInternalApi(this.entity.em).joinRows(this).addRemove(this, this.entity, e);
      });
      this.#removedBeforeLoaded = undefined;
    }
  }

  #current(opts?: { withDeleted?: boolean }): U[] {
    return this.filterDeleted(this.#loaded ?? this.#pendingSet ?? this.#addedBeforeLoaded ?? [], opts);
  }

  get meta(): EntityMetadata {
    return getMetadata(this.entity);
  }

  get otherMeta(): EntityMetadata {
    return (getMetadata(this.entity).allFields[this.fieldName] as ManyToManyField).otherMetadata();
  }

  get joinTableName(): string {
    return this.#field.joinTableName;
  }

  get fieldName(): string {
    return this.#field.fieldName;
  }

  get otherFieldName(): string & keyof U {
    return this.#field.otherFieldName as string & keyof U;
  }

  get columnName(): string {
    return this.#field.columnNames[0];
  }

  get otherColumnName(): string {
    return this.#field.columnNames[1];
  }

  get #isCascadeDelete(): boolean {
    return isCascadeDelete(this, this.fieldName);
  }

  get hasBeenSet(): boolean {
    return this.#hasBeenSet;
  }

  toString(): string {
    return `OneToManyCollection(entity: ${this.entity}, fieldName: ${this.fieldName}, otherType: ${this.otherMeta.type}, otherFieldName: ${this.otherFieldName})`;
  }

  #getPreloaded(): U[] | undefined {
    if (this.entity.isNewEntity) return undefined;
    return getEmInternalApi(this.entity.em).getPreloadedRelation<U>(this.entity.idTagged, this.fieldName);
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}

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
  #loadPromise: any;
  #state: M2MState<T, U>;

  // I.e. when entity = Book:
  // fieldName == tags, because it's our collection to tags
  // columnName = book_id, what we use as the `where book_id = us` to find our join table rows
  // otherFieldName = books, how tags points to us
  // otherColumnName = tag_id, how the other side finds its join table rows
  constructor(entity: T, field: ManyToManyField) {
    super(entity);
    this.#field = field;
    if (getInstanceData(entity).isOrWasNew) {
      this.#state = new LoadedState<T, U>(this, [], false);
    } else {
      this.#state = new UnloadedPristineState<T, U>(this);
    }
  }

  /** @internal */
  percolateAdd(other: U): void {
    (other[this.otherFieldName] as any as ManyToManyCollection<U, T>).add(this.entity, true);
  }

  /** @internal */
  percolateRemove(other: U): void {
    (other[this.otherFieldName] as any as ManyToManyCollection<U, T>).remove(this.entity, true);
  }

  /** @internal */
  registerJoinRowAdd(other: U): void {
    getEmInternalApi(this.entity.em).joinRows(this).addNew(this, this.entity, other);
  }

  /** @internal */
  registerJoinRowRemove(other: U): void {
    getEmInternalApi(this.entity.em).joinRows(this).addRemove(this, this.entity, other);
  }

  /** Removes pending-hard-delete or soft-deleted entities, unless explicitly asked for. */
  private filterDeleted(entities: U[], opts?: { withDeleted?: boolean }): U[] {
    return opts?.withDeleted === true
      ? [...entities]
      : entities.filter((e) => !e.isDeletedEntity && !(e as any).isSoftDeletedEntity);
  }

  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<ReadonlyArray<U>> {
    ensureNotDeleted(this.entity, "pending");
    if (!this.#state.isLoaded || (opts.forceReload && !this.entity.isNewEntity)) {
      const key = `${this.columnName}=${this.entity.id}`;
      const maybePreloaded = this.#getPreloaded();
      if (maybePreloaded) {
        this.#state = this.#state.applyLoad(maybePreloaded);
      } else {
        await (this.#loadPromise ??= manyToManyDataLoader(this.entity.em, this)
          .load(key)
          .then((dbEntities) => {
            this.#state = this.#state.applyLoad(dbEntities);
            this.#loadPromise = undefined;
          })
          .catch(function load(err) {
            throw appendStack(err, new Error());
          }));
      }
    }
    return this.filterDeleted(this.#state.doGet(), opts) as ReadonlyArray<U>;
  }

  async find(id: IdOf<U>): Promise<U | undefined> {
    ensureNotDeleted(this.entity, "pending");
    const inMemory = this.#state.find(id);
    if (inMemory) return inMemory;
    if (this.#state.isLoaded) return undefined;
    const key = `${this.columnName}=${this.entity.id},${this.otherColumnName}=${id}`;
    const includes = await manyToManyFindDataLoader(this.entity.em, this)
      .load(key)
      .catch(function load(err) {
        throw appendStack(err, new Error());
      });
    const taggedId = toTaggedId(this.otherMeta, id);
    return includes ? (this.entity.em.load(taggedId) as Promise<U>) : undefined;
  }

  async includes(other: U): Promise<boolean> {
    ensureNotDeleted(this.entity, "pending");
    const inMemory = this.#state.includesInMemory(other);
    if (inMemory !== undefined) return inMemory;
    if (other.isNewEntity) return false;
    const key = `${this.columnName}=${this.entity.id},${this.otherColumnName}=${other.id}`;
    return manyToManyFindDataLoader(this.entity.em, this)
      .load(key)
      .catch(function includes(err) {
        throw appendStack(err, new Error());
      });
  }

  add(other: U, percolated = false): void {
    ensureNotDeleted(this.entity);
    this.#state = this.#state.add(other, percolated);
  }

  remove(other: U, percolated = false): void {
    ensureNotDeleted(this.entity, "pending");
    this.#state = this.#state.remove(other, percolated);
  }

  get isLoaded(): boolean {
    return this.#state.isLoaded;
  }

  get isPreloaded(): boolean {
    return !!this.#getPreloaded();
  }

  preload(): void {
    const preloaded = this.#getPreloaded();
    if (preloaded) {
      this.#state = this.#state.applyLoad(preloaded);
    }
  }

  import(other: ManyToManyCollection<T, U>, _: unknown, mapEntities: (e: U[] | undefined) => U[] | undefined): void {
    this.#state = other.#state.import(this, mapEntities);
  }

  private doGet(): U[] {
    ensureNotDeleted(this.entity, "pending");
    return this.#state.doGet();
  }

  get getWithDeleted(): U[] {
    return this.filterDeleted(this.doGet(), { withDeleted: true });
  }

  get get(): U[] {
    return this.filterDeleted(this.doGet(), { withDeleted: false });
  }

  set(values: readonly U[]): void {
    ensureNotDeleted(this.entity);
    this.#state = this.#state.set(values);
  }

  removeAll(): void {
    ensureNotDeleted(this.entity);
    if (!this.#state.isLoaded) {
      throw new Error("removeAll was called when not loaded");
    }
    for (const other of [...this.#state.doGet()]) {
      this.remove(other);
    }
  }

  // impl details

  setFromOpts(others: U[]): void {
    this.#state = new LoadedState<T, U>(this, [], false);
    others.forEach((o) => this.add(o));
  }

  maybeCascadeDelete() {
    if (this.#isCascadeDelete) {
      this.filterDeleted(this.#state.current({ withDeleted: true }), { withDeleted: true }).forEach((e) =>
        this.entity.em.delete(e),
      );
    }
  }

  async cleanupOnEntityDeleted(): Promise<void> {
    if (this.#isCascadeDelete) return;
    const entities = await this.load({ withDeleted: true });
    entities.forEach((other) => {
      const m2m = other[this.otherFieldName] as any as ManyToManyCollection<U, T>;
      m2m.remove(this.entity);
    });
    if (this.#state instanceof LoadedState) {
      this.#state.setLoaded([]);
    }
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
    return this.#state.hasBeenSet;
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

/**
 * State interface for ManyToManyCollection state machine.
 *
 * State transitions:
 * ```
 * Constructor (existing entity) → UnloadedPristine
 * Constructor (new entity)      → Loaded
 *
 * UnloadedPristine + add/remove → UnloadedAddedRemoved
 * UnloadedPristine + set        → PendingSet
 * UnloadedPristine + applyLoad  → Loaded
 *
 * UnloadedAddedRemoved + set       → PendingSet
 * UnloadedAddedRemoved + applyLoad → Loaded (merges tracked adds/removes)
 *
 * PendingSet + applyLoad → Loaded (diffs pending values against DB)
 *
 * Loaded + applyLoad (forceReload) → Loaded (refreshed)
 * ```
 */
interface M2MState<T extends Entity, U extends Entity> {
  /** Adds an entity; may transition UnloadedPristine → UnloadedAddedRemoved. */
  add(other: U, percolated: boolean): M2MState<T, U>;
  /** Removes an entity; may transition UnloadedPristine → UnloadedAddedRemoved. */
  remove(other: U, percolated: boolean): M2MState<T, U>;
  /** Sets the collection; transitions UnloadedPristine/UnloadedAddedRemoved → PendingSet. */
  set(values: readonly U[]): M2MState<T, U>;
  /** Returns the current entities; throws if not loaded (except PendingSet returns pending values). */
  doGet(): U[];
  /** Finds an entity by id in memory; returns undefined if not found or not tracked. */
  find(id: IdOf<U>): U | undefined;
  /** Checks if entity is in memory; returns undefined if async lookup needed. */
  includesInMemory(other: U): boolean | undefined;
  /** Applies loaded DB entities; always transitions to Loaded. */
  applyLoad(dbEntities: U[]): LoadedState<T, U>;
  /** Returns current entities for cascade delete (works in any state). */
  current(opts?: { withDeleted?: boolean }): U[];
  /** Creates a copy of this state for a different collection (used by em.clone). */
  import(m2m: ManyToManyCollection<T, U>, mapEntities: (e: U[] | undefined) => U[] | undefined): M2MState<T, U>;
  readonly isLoaded: boolean;
  readonly hasBeenSet: boolean;
}

/** Initial state for existing entities - no data loaded yet. */
class UnloadedPristineState<T extends Entity, U extends Entity> implements M2MState<T, U> {
  readonly isLoaded = false;
  readonly hasBeenSet = false;
  #m2m: ManyToManyCollection<T, U>;

  constructor(m2m: ManyToManyCollection<T, U>) {
    this.#m2m = m2m;
  }

  add(other: U, percolated: boolean): M2MState<T, U> {
    const newState = new UnloadedAddedRemovedState<T, U>(this.#m2m, [other], []);
    if (!percolated) {
      this.#m2m.registerJoinRowAdd(other);
      this.#m2m.percolateAdd(other);
    }
    return newState;
  }

  remove(other: U, percolated: boolean): M2MState<T, U> {
    if (!percolated) {
      this.#m2m.registerJoinRowRemove(other);
      this.#m2m.percolateRemove(other);
    }
    return new UnloadedAddedRemovedState<T, U>(this.#m2m, [], [other]);
  }

  set(values: readonly U[]): M2MState<T, U> {
    return new PendingSetState<T, U>(this.#m2m, [...values]);
  }

  doGet(): U[] {
    throw new Error(`${this.#m2m.entity}.${this.#m2m.fieldName}.get was called when not loaded`);
  }

  find(_id: IdOf<U>): U | undefined {
    return undefined;
  }

  includesInMemory(_other: U): boolean | undefined {
    return undefined;
  }

  applyLoad(dbEntities: U[]): LoadedState<T, U> {
    return new LoadedState<T, U>(this.#m2m, dbEntities, false);
  }

  current(_opts?: { withDeleted?: boolean }): U[] {
    return [];
  }

  import(m2m: ManyToManyCollection<T, U>, _mapEntities: (e: U[] | undefined) => U[] | undefined): M2MState<T, U> {
    return new UnloadedPristineState<T, U>(m2m);
  }
}

/** State when add/remove called before load - tracks changes to merge later. */
class UnloadedAddedRemovedState<T extends Entity, U extends Entity> implements M2MState<T, U> {
  readonly isLoaded = false;
  readonly hasBeenSet = false;
  #m2m: ManyToManyCollection<T, U>;
  #added: U[];
  #removed: U[];

  constructor(m2m: ManyToManyCollection<T, U>, added: U[], removed: U[]) {
    this.#m2m = m2m;
    this.#added = added;
    this.#removed = removed;
  }

  add(other: U, percolated: boolean): M2MState<T, U> {
    maybeRemove(this.#removed, other);
    if (!this.#added.includes(other)) {
      this.#added.push(other);
    }
    if (!percolated) {
      this.#m2m.registerJoinRowAdd(other);
      this.#m2m.percolateAdd(other);
    }
    return this;
  }

  remove(other: U, percolated: boolean): M2MState<T, U> {
    if (!percolated) {
      this.#m2m.registerJoinRowRemove(other);
      this.#m2m.percolateRemove(other);
    }
    maybeRemove(this.#added, other);
    maybeAdd(this.#removed, other);
    return this;
  }

  set(values: readonly U[]): M2MState<T, U> {
    return new PendingSetState<T, U>(this.#m2m, [...values]);
  }

  doGet(): U[] {
    throw new Error(`${this.#m2m.entity}.${this.#m2m.fieldName}.get was called when not loaded`);
  }

  find(id: IdOf<U>): U | undefined {
    return this.#added.find((u) => u.id === id);
  }

  includesInMemory(other: U): boolean | undefined {
    if (this.#added.includes(other)) return true;
    return undefined;
  }

  applyLoad(dbEntities: U[]): LoadedState<T, U> {
    const loaded = [...dbEntities];
    for (const e of this.#added) {
      if (!loaded.includes(e)) {
        loaded.unshift(e);
        this.#m2m.registerJoinRowAdd(e);
      }
    }
    for (const e of this.#removed) {
      remove(loaded, e);
      this.#m2m.registerJoinRowRemove(e);
    }
    return new LoadedState<T, U>(this.#m2m, loaded, false);
  }

  current(_opts?: { withDeleted?: boolean }): U[] {
    return this.#added;
  }

  import(m2m: ManyToManyCollection<T, U>, mapEntities: (e: U[] | undefined) => U[] | undefined): M2MState<T, U> {
    const added = mapEntities(this.#added);
    const removed = mapEntities(this.#removed);
    return new UnloadedAddedRemovedState<T, U>(m2m, added ?? [], removed ?? []);
  }
}

/** State when set() called before load - holds pending values to diff on load. */
class PendingSetState<T extends Entity, U extends Entity> implements M2MState<T, U> {
  readonly isLoaded = false;
  readonly hasBeenSet = true;
  #m2m: ManyToManyCollection<T, U>;
  #pendingSet: U[];

  constructor(m2m: ManyToManyCollection<T, U>, pendingSet: U[]) {
    this.#m2m = m2m;
    this.#pendingSet = pendingSet;
    getEmInternalApi(m2m.entity.em).pendingLoads.add(m2m);
  }

  add(other: U, percolated: boolean): M2MState<T, U> {
    if (!this.#pendingSet.includes(other)) {
      this.#pendingSet.push(other);
    }
    if (!percolated) {
      this.#m2m.registerJoinRowAdd(other);
      this.#m2m.percolateAdd(other);
    }
    return this;
  }

  remove(other: U, percolated: boolean): M2MState<T, U> {
    if (!percolated) {
      this.#m2m.registerJoinRowRemove(other);
      this.#m2m.percolateRemove(other);
    }
    remove(this.#pendingSet, other);
    return this;
  }

  set(values: readonly U[]): M2MState<T, U> {
    this.#pendingSet = [...values];
    return this;
  }

  doGet(): U[] {
    return this.#pendingSet;
  }

  find(id: IdOf<U>): U | undefined {
    return this.#pendingSet.find((u) => u.id === id);
  }

  includesInMemory(other: U): boolean | undefined {
    return this.#pendingSet.includes(other);
  }

  applyLoad(dbEntities: U[]): LoadedState<T, U> {
    const loaded = [...dbEntities];
    const pending = this.#pendingSet;
    for (const other of [...loaded]) {
      if (!pending.includes(other)) {
        remove(loaded, other);
        this.#m2m.registerJoinRowRemove(other);
        this.#m2m.percolateRemove(other);
      }
    }
    for (const other of pending) {
      if (!loaded.includes(other)) {
        loaded.push(other);
        this.#m2m.registerJoinRowAdd(other);
        this.#m2m.percolateAdd(other);
      }
    }
    return new LoadedState<T, U>(this.#m2m, loaded, true);
  }

  current(_opts?: { withDeleted?: boolean }): U[] {
    return this.#pendingSet;
  }

  import(m2m: ManyToManyCollection<T, U>, mapEntities: (e: U[] | undefined) => U[] | undefined): M2MState<T, U> {
    const pendingSet = mapEntities(this.#pendingSet);
    return new PendingSetState<T, U>(m2m, pendingSet ?? []);
  }
}

/** State when collection is loaded - all operations work directly on loaded array. */
class LoadedState<T extends Entity, U extends Entity> implements M2MState<T, U> {
  readonly isLoaded = true;
  #m2m: ManyToManyCollection<T, U>;
  #loaded: U[];
  #hasBeenSet: boolean;

  constructor(m2m: ManyToManyCollection<T, U>, loaded: U[], hasBeenSet: boolean) {
    this.#m2m = m2m;
    this.#loaded = loaded;
    this.#hasBeenSet = hasBeenSet;
  }

  get hasBeenSet(): boolean {
    return this.#hasBeenSet;
  }

  add(other: U, percolated: boolean): M2MState<T, U> {
    if (this.#loaded.includes(other)) return this;
    this.#loaded.push(other);
    if (!percolated) {
      this.#m2m.registerJoinRowAdd(other);
      this.#m2m.percolateAdd(other);
    }
    return this;
  }

  remove(other: U, percolated: boolean): M2MState<T, U> {
    if (!percolated) {
      this.#m2m.registerJoinRowRemove(other);
      this.#m2m.percolateRemove(other);
    }
    remove(this.#loaded, other);
    return this;
  }

  set(values: readonly U[]): M2MState<T, U> {
    this.#hasBeenSet = true;
    const loaded = new Set([...this.#loaded]);
    const valuesSet = new Set(values);
    for (const other of loaded) {
      if (!valuesSet.has(other)) {
        this.remove(other, false);
      }
    }
    for (const other of values) {
      if (!loaded.has(other)) {
        this.add(other, false);
      }
    }
    return this;
  }

  doGet(): U[] {
    return this.#loaded;
  }

  find(id: IdOf<U>): U | undefined {
    return this.#loaded.find((u) => u.id === id);
  }

  includesInMemory(other: U): boolean | undefined {
    return this.#loaded.includes(other);
  }

  applyLoad(dbEntities: U[]): LoadedState<T, U> {
    this.#loaded = dbEntities;
    return this;
  }

  current(_opts?: { withDeleted?: boolean }): U[] {
    return this.#loaded;
  }

  import(m2m: ManyToManyCollection<T, U>, mapEntities: (e: U[] | undefined) => U[] | undefined): M2MState<T, U> {
    const loaded = mapEntities(this.#loaded);
    return new LoadedState<T, U>(m2m, loaded ?? [], this.#hasBeenSet);
  }

  getLoaded(): U[] {
    return this.#loaded;
  }

  setLoaded(entities: U[]): void {
    this.#loaded = entities;
  }
}

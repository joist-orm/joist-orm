import { oneToManyDataLoader } from "../dataloaders/oneToManyDataLoader";
import { oneToManyFindDataLoader } from "../dataloaders/oneToManyFindDataLoader";
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
  maybeResolveReferenceToId,
  OneToManyField,
  sameEntity,
} from "../index";
import { IsLoadedCachable } from "../IsLoadedCache";
import { lazyField } from "../newEntity";
import { clear, compareValues, maybeAdd, maybeRemove, remove } from "../utils";
import { AbstractRelationImpl, isCascadeDelete } from "./AbstractRelationImpl";
import { ManyToOneReferenceImpl } from "./ManyToOneReference";
import { RelationT, RelationU } from "./Relation";

/** An alias for creating `OneToManyCollection`s. */
export function hasMany<T extends Entity, U extends Entity>(): Collection<T, U> {
  return lazyField((entity: T, fieldName) => {
    const field = getMetadata(entity).allFields[fieldName] as OneToManyField;
    return new OneToManyCollection(entity, field);
  });
}

export class OneToManyCollection<T extends Entity, U extends Entity>
  extends AbstractRelationImpl<T, U[]>
  implements Collection<T, U>, IsLoadedCachable
{
  readonly #field: OneToManyField;
  #state: O2MState<T, U>;
  #loadPromise: any;
  // Constantly filtering+sorting our `.get` values can be surprisingly expensive if called
  // when processing many entities/writing code that calls it repeatedly, so we cache it
  // both the "without deleted" default (`getSorted`) and "all deleted" (`allSorted`).
  #getSorted: U[] | undefined;
  #allSorted: U[] | undefined;

  constructor(entity: T, field: OneToManyField) {
    super(entity);
    this.#field = field;
    if (getInstanceData(entity).isOrWasNew) {
      this.#state = new O2MLoadedState<T, U>(this, [], false);
    } else {
      this.#state = new O2MUnloadedPristineState<T, U>(this);
    }
  }

  // opts is an internal parameter
  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<readonly U[]> {
    ensureNotDeleted(this.entity, "pending");
    if (!this.#state.isLoaded || (opts.forceReload && !this.entity.isNewEntity)) {
      const maybePreloaded = this.getPreloaded();
      if (maybePreloaded) {
        this.#state = this.#state.applyLoad(maybePreloaded);
      } else {
        await (this.#loadPromise ??= oneToManyDataLoader(this.entity.em, this)
          .load(this.entity.idTagged!)
          .then((dbEntities) => {
            this.#state = this.#state.applyLoad(dbEntities);
            this.#loadPromise = undefined;
          })
          .catch(function load(err) {
            throw appendStack(err, new Error());
          }));
      }
      this.#getSorted = undefined;
      this.#allSorted = undefined;
    }
    return opts?.withDeleted ? this.getWithDeleted : this.get;
  }

  async find(id: IdOf<U>): Promise<U | undefined> {
    ensureNotDeleted(this.entity, "pending");
    const inMemory = this.#state.find(id);
    if (inMemory) return inMemory;
    if (this.#state.isLoaded) return undefined;
    const key = `id=${id},${this.#field.otherColumnName}=${this.entity.id}`;
    return oneToManyFindDataLoader(this.entity.em, this)
      .load(key)
      .catch(function find(err) {
        throw appendStack(err, new Error());
      });
  }

  async includes(other: U): Promise<boolean> {
    return sameEntity(this.entity, this.getOtherRelation(other).current());
  }

  get isLoaded(): boolean {
    return this.#state.isLoaded;
  }

  resetIsLoaded(): void {
    this.#getSorted = undefined;
    this.#allSorted = undefined;
  }

  get isPreloaded(): boolean {
    return !!this.getPreloaded();
  }

  preload(): void {
    const preloaded = this.getPreloaded();
    if (preloaded) {
      this.#state = this.#state.applyLoad(preloaded);
      this.#getSorted = undefined;
      this.#allSorted = undefined;
    }
  }

  import(other: OneToManyCollection<T, U>, findEntity: (e: U) => U): void {
    this.#state = other.#state.import(this, findEntity);
    this.#getSorted = undefined;
    this.#allSorted = undefined;
  }

  // todo: this only be a readonly U[]
  get get(): U[] {
    ensureNotDeleted(this.entity, "pending");
    if (this.#getSorted !== undefined) return this.#getSorted;
    this.#getSorted = Object.freeze(this.filterDeleted(this.#state.doGet(), { withDeleted: false })) as U[];
    getEmInternalApi(this.entity.em).isLoadedCache.addNaive(this);
    return this.#getSorted;
  }

  get getWithDeleted(): U[] {
    ensureNotDeleted(this.entity, "pending");
    if (this.#allSorted !== undefined) return this.#allSorted;
    this.#allSorted = Object.freeze(this.filterDeleted(this.#state.doGet(), { withDeleted: true })) as U[];
    getEmInternalApi(this.entity.em).isLoadedCache.addNaive(this);
    return this.#allSorted;
  }

  set(values: readonly U[]): void {
    ensureNotDeleted(this.entity);
    this.#state = this.#state.set(values);
    this.#getSorted = undefined;
    this.#allSorted = undefined;
  }

  add(other: U): void {
    ensureNotDeleted(this.entity);
    this.#state = this.#state.add(other);
    this.percolateAdd(other);
    this.registerAsMutated();
    this.#getSorted = undefined;
    this.#allSorted = undefined;
  }

  remove(other: U, opts: { requireLoaded: boolean } = { requireLoaded: true }) {
    ensureNotDeleted(this.entity, "pending");
    this.#state = this.#state.remove(other, opts);
    this.percolateRemove(other);
    this.registerAsMutated();
    this.#getSorted = undefined;
    this.#allSorted = undefined;
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

  // internal impl

  /** @internal */
  percolateAdd(other: U): void {
    this.getOtherRelation(other).set(this.entity);
  }

  /** @internal */
  percolateRemove(other: U): void {
    this.getOtherRelation(other).set(undefined);
  }

  /** @internal */
  registerAsMutated(): void {
    getEmInternalApi(this.entity.em).mutatedCollections.add(this);
  }

  setFromOpts(others: U[]): void {
    this.#state = new O2MLoadedState<T, U>(this, [], false);
    others.forEach((o) => this.add(o));
  }

  removeIfLoaded(other: U) {
    this.#state = this.#state.removeIfLoaded(other);
    this.registerAsMutated();
    this.#getSorted = undefined;
    this.#allSorted = undefined;
  }

  maybeCascadeDelete(): void {
    if (this.isCascadeDelete) {
      this.current({ withDeleted: true }).forEach((e) => this.entity.em.delete(e));
    }
  }

  // We already unhooked all children in our addedBeforeLoaded list; now load the full list if necessary.
  async cleanupOnEntityDeleted(): Promise<void> {
    // if we are going to delete this relation as well, then we don't need to clean it up
    if (this.isCascadeDelete) return;
    const current = await this.load({ withDeleted: true });
    current.forEach((other) => {
      const m2o = this.getOtherRelation(other);
      if (maybeResolveReferenceToId(m2o.current({ withDeleted: true })) === this.entity.idMaybe) {
        m2o.set(undefined);
      }
    });
    this.#state = new O2MLoadedState<T, U>(this, [], false);
    this.#getSorted = undefined;
    this.#allSorted = undefined;
  }

  // These are public to our internal implementation but not exposed in the Collection API
  public get fieldName(): keyof T & string {
    return this.#field.fieldName as keyof T & string;
  }

  public get otherFieldName(): keyof U & string {
    return this.#field.otherFieldName as keyof U & string;
  }

  current(opts?: { withDeleted?: boolean }): U[] {
    return this.filterDeleted(this.#state.current(), opts);
  }

  public get meta(): EntityMetadata {
    return getMetadata(this.entity);
  }

  public get otherMeta(): EntityMetadata {
    return (getMetadata(this.entity).allFields[this.fieldName] as OneToManyField).otherMetadata();
  }

  public get hasBeenSet(): boolean {
    return this.#state.hasBeenSet;
  }

  public toString(): string {
    return `OneToManyCollection(entity: ${this.entity}, fieldName: ${this.fieldName}, otherType: ${this.otherMeta.type}, otherFieldName: ${this.otherFieldName})`;
  }

  /** Called after `em.flush` to reset our dirty tracking. */
  public resetAddedRemoved(): void {
    this.#state.resetAddedRemoved();
  }

  /** Removes pending-hard-delete or soft-deleted entities, unless explicitly asked for. */
  private filterDeleted(entities: U[], opts?: { withDeleted?: boolean }): U[] {
    const list =
      opts?.withDeleted === true
        ? [...entities]
        : entities.filter((e) => !e.isDeletedEntity && !(e as any).isSoftDeletedEntity);
    if (this.#field.orderBy) {
      const { field, direction } = this.#field.orderBy;
      list.sort((a, b) => compareValues((a as any)[field], (b as any)[field], direction));
    }
    return list;
  }

  /** Returns the other relation that points back at us, i.e. we're `Author.image` and this is `Image.author_id`. */
  private getOtherRelation(other: U): ManyToOneReferenceImpl<U, T, any> {
    return (other as U)[this.otherFieldName] as any;
  }

  private get isCascadeDelete(): boolean {
    return isCascadeDelete(this, this.fieldName);
  }

  private getPreloaded(): U[] | undefined {
    if (this.entity.isNewEntity) return undefined;
    return getEmInternalApi(this.entity.em).getPreloadedRelation<U>(this.entity.idTagged, this.fieldName);
  }

  // Exposed for changes
  added(): U[] {
    return this.#state.added();
  }

  removed(): U[] {
    return this.#state.removed();
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}

/**
 * State interface for OneToManyCollection state machine.
 *
 * States handle only data tracking — side effects (percolation, mutation registration)
 * are handled by the collection methods that call into these states.
 *
 * State transitions:
 * ```
 * Constructor (new entity)      → Loaded (empty [])
 * Constructor (existing entity) → UnloadedPristine
 *
 * UnloadedPristine + add/remove    → UnloadedAddedRemoved
 * UnloadedPristine + load/preload  → Loaded
 *
 * UnloadedAddedRemoved + load/preload → Loaded (merges adds/removes)
 *
 * Loaded + forceReload → Loaded (refreshed, re-merges pending)
 * ```
 */
interface O2MState<T extends Entity, U extends Entity> {
  add(other: U): O2MState<T, U>;
  remove(other: U, opts: { requireLoaded: boolean }): O2MState<T, U>;
  removeIfLoaded(other: U): O2MState<T, U>;
  set(values: readonly U[]): O2MState<T, U>;
  doGet(): U[];
  find(id: IdOf<U>): U | undefined;
  applyLoad(dbEntities: U[]): O2MLoadedState<T, U>;
  current(): U[];
  import(o2m: OneToManyCollection<T, U>, findEntity: (e: U) => U): O2MState<T, U>;
  readonly isLoaded: boolean;
  readonly hasBeenSet: boolean;
  added(): U[];
  removed(): U[];
  resetAddedRemoved(): void;
}

/** Initial state for existing entities - no data loaded yet. */
class O2MUnloadedPristineState<T extends Entity, U extends Entity> implements O2MState<T, U> {
  readonly isLoaded = false;
  readonly hasBeenSet = false;
  #o2m: OneToManyCollection<T, U>;

  constructor(o2m: OneToManyCollection<T, U>) {
    this.#o2m = o2m;
  }

  add(other: U): O2MState<T, U> {
    return new O2MUnloadedAddedRemovedState<T, U>(this.#o2m, [other], []);
  }

  remove(_other: U, opts: { requireLoaded: boolean }): O2MState<T, U> {
    if (opts.requireLoaded) {
      throw new Error("remove was called when not loaded");
    }
    return new O2MUnloadedAddedRemovedState<T, U>(this.#o2m, [], [_other]);
  }

  removeIfLoaded(other: U): O2MState<T, U> {
    return new O2MUnloadedAddedRemovedState<T, U>(this.#o2m, [], [other]);
  }

  set(_values: readonly U[]): O2MState<T, U> {
    throw new Error("set was called when not loaded");
  }

  doGet(): U[] {
    throw new Error("get was called when not loaded");
  }

  find(_id: IdOf<U>): U | undefined {
    return undefined;
  }

  applyLoad(dbEntities: U[]): O2MLoadedState<T, U> {
    const loaded = applyLoad(this.#o2m, dbEntities, [], []);
    return new O2MLoadedState<T, U>(this.#o2m, loaded, false);
  }

  current(): U[] {
    return [];
  }

  import(o2m: OneToManyCollection<T, U>, _findEntity: (e: U) => U): O2MState<T, U> {
    return new O2MUnloadedPristineState<T, U>(o2m);
  }

  added(): U[] {
    return [];
  }

  removed(): U[] {
    return [];
  }

  resetAddedRemoved(): void {}
}

/** State when add/remove called before load - tracks changes to merge later. */
class O2MUnloadedAddedRemovedState<T extends Entity, U extends Entity> implements O2MState<T, U> {
  readonly isLoaded = false;
  readonly hasBeenSet = false;
  #o2m: OneToManyCollection<T, U>;
  #added: U[];
  #removed: U[];

  constructor(o2m: OneToManyCollection<T, U>, added: U[], removed: U[]) {
    this.#o2m = o2m;
    this.#added = added;
    this.#removed = removed;
  }

  add(other: U): O2MState<T, U> {
    maybeAdd(this.#added, other);
    maybeRemove(this.#removed, other);
    return this;
  }

  remove(other: U, opts: { requireLoaded: boolean }): O2MState<T, U> {
    if (opts.requireLoaded) {
      throw new Error("remove was called when not loaded");
    }
    maybeAdd(this.#removed, other);
    maybeRemove(this.#added, other);
    return this;
  }

  removeIfLoaded(other: U): O2MState<T, U> {
    maybeRemove(this.#added, other);
    maybeAdd(this.#removed, other);
    return this;
  }

  set(_values: readonly U[]): O2MState<T, U> {
    throw new Error("set was called when not loaded");
  }

  doGet(): U[] {
    throw new Error("get was called when not loaded");
  }

  find(id: IdOf<U>): U | undefined {
    return this.#added.find((u) => !u.isNewEntity && u.id === id);
  }

  applyLoad(dbEntities: U[]): O2MLoadedState<T, U> {
    const loaded = applyLoad(this.#o2m, dbEntities, this.#added, this.#removed);
    return new O2MLoadedState<T, U>(this.#o2m, loaded, false, this.#added, this.#removed);
  }

  current(): U[] {
    return this.#added;
  }

  import(o2m: OneToManyCollection<T, U>, findEntity: (e: U) => U): O2MState<T, U> {
    return new O2MUnloadedAddedRemovedState<T, U>(
      o2m,
      mapEntities(this.#added, findEntity),
      mapEntities(this.#removed, findEntity),
    );
  }

  added(): U[] {
    return this.#added;
  }

  removed(): U[] {
    return this.#removed;
  }

  resetAddedRemoved(): void {
    this.#added = [];
    this.#removed = [];
  }
}

/** State when collection is loaded - all operations work directly on loaded array. */
class O2MLoadedState<T extends Entity, U extends Entity> implements O2MState<T, U> {
  readonly isLoaded = true;
  #o2m: OneToManyCollection<T, U>;
  #loaded: U[];
  #added: U[];
  #removed: U[];
  #hasBeenSet: boolean;

  constructor(o2m: OneToManyCollection<T, U>, loaded: U[], hasBeenSet: boolean, added: U[] = [], removed: U[] = []) {
    this.#o2m = o2m;
    this.#loaded = loaded;
    this.#added = added;
    this.#removed = removed;
    this.#hasBeenSet = hasBeenSet;
  }

  get hasBeenSet(): boolean {
    return this.#hasBeenSet;
  }

  add(other: U): O2MState<T, U> {
    maybeAdd(this.#added, other);
    maybeRemove(this.#removed, other);
    maybeAdd(this.#loaded, other);
    return this;
  }

  remove(other: U, _opts: { requireLoaded: boolean }): O2MState<T, U> {
    maybeAdd(this.#removed, other);
    maybeRemove(this.#added, other);
    remove(this.#loaded, other);
    return this;
  }

  removeIfLoaded(other: U): O2MState<T, U> {
    maybeRemove(this.#added, other);
    maybeAdd(this.#removed, other);
    remove(this.#loaded, other);
    return this;
  }

  set(values: readonly U[]): O2MState<T, U> {
    this.#hasBeenSet = true;

    const o2m = this.#o2m;
    const otherCannotChange = o2m.otherMeta.allFields[o2m.otherFieldName].immutable;
    const isCascade = isCascadeDelete(o2m, o2m.fieldName);
    if (isCascade && otherCannotChange) {
      const implicitlyDeleted = this.#loaded.filter((e) => !values.includes(e));
      implicitlyDeleted.forEach((e) => o2m.entity.em.delete(e));
      values = [...values, ...implicitlyDeleted];
    }

    const loaded = new Set([...this.#loaded]);
    const valuesSet = new Set(values);
    for (const other of loaded) {
      if (!valuesSet.has(other)) o2m.remove(other);
    }
    for (const other of values) {
      if (!loaded.has(other)) o2m.add(other);
    }
    return this;
  }

  doGet(): U[] {
    return this.#loaded;
  }

  find(id: IdOf<U>): U | undefined {
    return this.#loaded.find((other) => !other.isNewEntity && other.id === id);
  }

  applyLoad(dbEntities: U[]): O2MLoadedState<T, U> {
    // On forceReload, replace loaded but preserve pending adds/removes
    const loaded = new Set([...dbEntities]);
    for (const e of this.#added) loaded.add(e);
    for (const e of this.#removed) loaded.delete(e);
    this.#loaded = [...loaded];
    return this;
  }

  current(): U[] {
    return this.#loaded;
  }

  import(o2m: OneToManyCollection<T, U>, findEntity: (e: U) => U): O2MState<T, U> {
    return new O2MLoadedState<T, U>(
      o2m,
      mapEntities(this.#loaded, findEntity),
      this.#hasBeenSet,
      mapEntities(this.#added, findEntity),
      mapEntities(this.#removed, findEntity),
    );
  }

  added(): U[] {
    return this.#added;
  }

  removed(): U[] {
    return this.#removed;
  }

  resetAddedRemoved(): void {
    this.#added = [];
    this.#removed = [];
  }
}

function mapEntities<U extends Entity>(entities: U[], findEntity: (e: U) => U): U[] {
  const result = new Array<U>(entities.length);
  for (let i = 0; i < entities.length; i++) result[i] = findEntity(entities[i]);
  return result;
}

/**
 * Creates the new loaded array by merging:
 *
 * - the loaded entities from the database (dbEntities)
 * - any o2m-side preload changes (added/removed to our o2m),
 * - any m2o-side preload changes (sets to the other side m2o)
 */
function applyLoad<T extends Entity, U extends Entity>(
  o2m: OneToManyCollection<T, U>,
  dbEntities: U[],
  added: U[],
  removed: U[],
): U[] {
  const entity = o2m.entity;
  // Merge pending children from m2o mutations
  if (!entity.isNewEntity) {
    const { em } = entity;
    const pending = getEmInternalApi(em).pendingChildren.get(entity.idTagged!)?.get(o2m.fieldName);
    if (pending) {
      added = [...added, ...(pending.adds as U[])];
      removed = [...removed, ...(pending.removes as U[])];
      clear(pending.adds);
      clear(pending.removes);
    }
  }
  // Push added entities on the end to better match the db order of "newer things come last"
  const loaded = new Set([...dbEntities]);
  for (const e of added) loaded.add(e);
  for (const e of removed) loaded.delete(e);
  return [...loaded];
}

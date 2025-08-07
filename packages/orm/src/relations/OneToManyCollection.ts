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
  OrderBy,
  sameEntity,
} from "../index";
import { IsLoadedCachable } from "../IsLoadedCache";
import { clear, compareValues, maybeAdd, maybeRemove, remove } from "../utils";
import { AbstractRelationImpl, isCascadeDelete } from "./AbstractRelationImpl";
import { ManyToOneReferenceImpl } from "./ManyToOneReference";
import { RelationT, RelationU } from "./Relation";

/** An alias for creating `OneToManyCollection`s. */
export function hasMany<T extends Entity, U extends Entity>(
  entity: T,
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T & string,
  otherFieldName: keyof U & string,
  otherColumnName: string,
  orderBy: { field: keyof U; direction: OrderBy } | undefined,
): Collection<T, U> {
  return new OneToManyCollection(entity, otherMeta, fieldName, otherFieldName, otherColumnName, orderBy);
}

export class OneToManyCollection<T extends Entity, U extends Entity>
  extends AbstractRelationImpl<T, U[]>
  implements Collection<T, U>, IsLoadedCachable
{
  readonly #fieldName: keyof T & string;
  readonly #orderBy: { field: keyof U; direction: OrderBy } | undefined;
  // We can track both value-and-isLoaded with a single `#loaded` b/c `[]` is always our empty value
  #loaded: U[] | undefined;
  // Constantly filtering+sorting our `.get` values can be surprisingly expensive if called
  // when processing many entities/writing code that calls it repeatedly, so we cache it
  // both the "without deleted" default (`getSorted`) and "all deleted" (`allSorted`).
  #getSorted: U[] | undefined;
  #allSorted: U[] | undefined;
  // We _used_ to not track `#removed`, because if a child is removed in our unloaded state,
  // when we load and get back the `child X has parent_id = our id` rows from the db, `loaderForCollection`
  // groups the hydrated rows by their _current parent m2o field value_, which for a removed child will no
  // longer be us, so it will effectively not show up in our post-load `loaded` array.
  // However, now with join preloading, the getPreloadedRelation might still have pre-load removed children.
  #added: U[] | undefined;
  #removed: U[] | undefined;
  #hasBeenSet = false;

  constructor(
    // These are public to our internal implementation but not exposed in the Collection API
    entity: T,
    otherMeta: EntityMetadata,
    public fieldName: keyof T & string,
    public otherFieldName: keyof U & string,
    public otherColumnName: string,
    orderBy: { field: keyof U; direction: OrderBy } | undefined,
  ) {
    super(entity);
    this.#fieldName = fieldName;
    this.#orderBy = orderBy;
    if (getInstanceData(entity).isOrWasNew) {
      this.#loaded = [];
    }
  }

  // opts is an internal parameter
  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<readonly U[]> {
    ensureNotDeleted(this.entity, "pending");
    if (this.#loaded === undefined || (opts.forceReload && !this.entity.isNewEntity)) {
      // If forceReload=true, the `.load` might return a cached array, which one would think is stale
      // (i.e. it doesn't have our WIP adds & removes applied to it), _but_ because we've been mutating
      // our `this.loaded`, really `.load` is a noop, and just gives us back the same list we had before.
      //
      // ...although if we'd:
      // a) created an array in the DL cache
      // b) em.flushed & reset the dataloaders
      // c) make WIP changes to our existing array
      // d) called `forceReload: true`
      // e) we'll ask the dataloader for a new array, and will be missing our WIP changes
      const dl = oneToManyDataLoader(this.entity.em, this);
      this.#loaded =
        this.getPreloaded() ??
        (await dl.load(this.entity.idTagged!).catch(function load(err) {
          throw appendStack(err, new Error());
        }));
      // If we're reloading (i.e. `forceReload: true`), then we need to clear our caches
      this.#getSorted = undefined;
      this.#allSorted = undefined;
      this.maybeAppendAddedBeforeLoaded();
    }
    return opts?.withDeleted ? this.getWithDeleted : this.get;
  }

  async find(id: IdOf<U>): Promise<U | undefined> {
    ensureNotDeleted(this.entity, "pending");
    if (this.#loaded !== undefined) {
      return this.#loaded.find((other) => !other.isNewEntity && other.id === id);
    } else {
      const added = this.#added?.find((u) => !u.isNewEntity && u.id === id);
      if (added) return added;
      // Make a cacheable tuple to look up this specific o2m row
      const key = `id=${id},${this.otherColumnName}=${this.entity.id}`;
      return oneToManyFindDataLoader(this.entity.em, this)
        .load(key)
        .catch(function find(err) {
          throw appendStack(err, new Error());
        });
    }
  }

  async includes(other: U): Promise<boolean> {
    return sameEntity(this.entity, this.getOtherRelation(other).current());
  }

  get isLoaded(): boolean {
    return this.#loaded !== undefined;
  }

  resetIsLoaded(): void {
    // Invalidate our .get cache on any mutation; in theory we could do this only if this
    // mutation was from an `other`, i.e. when entities are deleted or something in our
    // `orderBy` changes (although we some RF `orderBy`s, which might be a pain to track).
    this.#getSorted = undefined;
    this.#allSorted = undefined;
  }

  get isPreloaded(): boolean {
    return !!this.getPreloaded();
  }

  preload(): void {
    this.#loaded = this.getPreloaded();
    this.maybeAppendAddedBeforeLoaded();
  }

  import(other: OneToManyCollection<T, U>, findEntity: (e: U) => U): void {
    function map(v: U[] | undefined): U[] | undefined {
      if (v === undefined) return undefined;
      const result = new Array<U>(v.length);
      for (let i = 0; i < v.length; i++) result[i] = findEntity(v[i]);
      return result;
    }

    this.#loaded = map(other.#loaded);
    this.#added = map(other.#added);
    this.#removed = map(other.#removed);
    this.#getSorted = undefined;
    this.#allSorted = undefined;
  }

  // todo: this only be a readonly U[]
  get get(): U[] {
    ensureNotDeleted(this.entity, "pending");
    if (this.#getSorted !== undefined) return this.#getSorted;
    this.#getSorted = Object.freeze(this.filterDeleted(this.doGet(), { withDeleted: false })) as U[];
    getEmInternalApi(this.entity.em).isLoadedCache.addNaive(this);
    return this.#getSorted;
  }

  get getWithDeleted(): U[] {
    ensureNotDeleted(this.entity, "pending");
    if (this.#allSorted !== undefined) return this.#allSorted;
    this.#allSorted = Object.freeze(this.filterDeleted(this.doGet(), { withDeleted: true })) as U[];
    getEmInternalApi(this.entity.em).isLoadedCache.addNaive(this);
    return this.#allSorted;
  }

  private doGet(): U[] {
    // This should only be callable in the type system if we've already resolved this to an instance
    if (this.#loaded === undefined) {
      throw new Error("get was called when not loaded");
    }
    return this.#loaded;
  }

  set(values: readonly U[]): void {
    ensureNotDeleted(this.entity);
    if (this.#loaded === undefined) {
      throw new Error("set was called when not loaded");
    }
    this.#hasBeenSet = true;

    // If we're changing `a1.books = [b1, b2]` to `a1.books = [b2]`, then implicitly delete the old book
    const otherCannotChange = this.otherMeta.allFields[this.otherFieldName].immutable;
    if (this.isCascadeDelete && otherCannotChange) {
      const implicitlyDeleted = this.#loaded.filter((e) => !values.includes(e));
      // The `em.delete` will internally invalidate our `#getSorted` / `#allSorted` caches, which will be dirty now
      implicitlyDeleted.forEach((e) => this.entity.em.delete(e));
      // Keep the implicitlyDeleted values for `getWithDeleted` to return
      values = [...values, ...implicitlyDeleted];
    }

    // Make a copy for safe iteration
    const loaded = [...this.#loaded];
    // Remove old values
    for (const other of loaded) {
      if (!values.includes(other)) {
        this.remove(other);
      }
    }
    for (const other of values) {
      if (!loaded.includes(other)) {
        this.add(other);
      }
    }
  }

  add(other: U): void {
    ensureNotDeleted(this.entity);
    this.#added ??= [];
    maybeAdd(this.#added, other);
    maybeRemove(this.#removed, other);
    if (this.#loaded !== undefined) {
      maybeAdd(this.#loaded, other);
      this.#getSorted = undefined;
      this.#allSorted = undefined;
    }
    this.registerAsMutated();
    // This will no-op and mark other dirty if necessary
    this.getOtherRelation(other).set(this.entity);
  }

  // We're not supported remove(other) because that might leave other.otherFieldName as undefined,
  // which we don't know if that's valid or not, i.e. depending on whether the field is nullable.
  remove(other: U, opts: { requireLoaded: boolean } = { requireLoaded: true }) {
    ensureNotDeleted(this.entity, "pending");
    if (this.#loaded === undefined && opts.requireLoaded) {
      throw new Error("remove was called when not loaded");
    }
    this.#removed ??= [];
    maybeAdd(this.#removed, other);
    maybeRemove(this.#added, other);
    if (this.#loaded !== undefined) {
      remove(this.#loaded, other);
      this.#getSorted = undefined;
      this.#allSorted = undefined;
    }
    this.registerAsMutated();
    // This will no-op and mark other dirty if necessary
    this.getOtherRelation(other).set(undefined);
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

  // internal impl

  setFromOpts(others: U[]): void {
    this.#loaded = [];
    others.forEach((o) => this.add(o));
  }

  removeIfLoaded(other: U) {
    this.#removed ??= [];
    maybeRemove(this.#added, other);
    maybeAdd(this.#removed, other);
    if (this.#loaded !== undefined) {
      remove(this.#loaded, other);
    }
    this.registerAsMutated();
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
        // TODO What if other.otherFieldName is required/not-null?
        m2o.set(undefined);
      }
    });
    this.#loaded = [];
    this.#added = [];
    this.#removed = [];
    this.#getSorted = undefined;
    this.#allSorted = undefined;
  }

  private maybeAppendAddedBeforeLoaded(): void {
    // If our entity is not new, then entities in the EM might have been mutated to point
    // to our foreign key (instead of our loaded instance), which means they should be in
    // `addedBeforeLoaded` but are not.
    //
    // (Note that we don't have to handle the case for "removed before loaded" here because
    // the oneToManyDataLoader already handles that; although maybe arguably that logic should
    // be handled here?)
    if (!this.entity.isNewEntity) {
      const { em } = this.entity;
      const pending = getEmInternalApi(em).pendingChildren.get(this.entity.idTagged!)?.get(this.fieldName);
      if (pending) {
        (this.#added ??= []).push(...(pending.adds as U[]));
        (this.#removed ??= []).push(...(pending.removes as U[]));
        clear(pending.adds);
        clear(pending.removes);
      }
    }
    if (this.#added) {
      const newEntities = this.#added.filter((e) => !this.#loaded?.includes(e));
      // Push on the end to better match the db order of "newer things come last"
      this.#loaded!.push(...newEntities);
    }
    if (this.#removed) {
      this.#removed.forEach((e) => remove(this.#loaded!, e));
    }
  }

  current(opts?: { withDeleted?: boolean }): U[] {
    return this.filterDeleted(this.#loaded ?? this.#added ?? [], opts);
  }

  public get meta(): EntityMetadata {
    return getMetadata(this.entity);
  }

  public get otherMeta(): EntityMetadata {
    return (getMetadata(this.entity).allFields[this.#fieldName] as OneToManyField).otherMetadata();
  }

  public get hasBeenSet(): boolean {
    return this.#hasBeenSet;
  }

  public toString(): string {
    return `OneToManyCollection(entity: ${this.entity}, fieldName: ${this.fieldName}, otherType: ${this.otherMeta.type}, otherFieldName: ${this.otherFieldName})`;
  }

  /** Called after `em.flush` to reset our dirty tracking. */
  public resetAddedRemoved(): void {
    this.#added = undefined;
    this.#removed = undefined;
  }

  /** Removes pending-hard-delete or soft-deleted entities, unless explicitly asked for. */
  private filterDeleted(entities: U[], opts?: { withDeleted?: boolean }): U[] {
    const list =
      opts?.withDeleted === true
        ? [...entities]
        : entities.filter((e) => !e.isDeletedEntity && !(e as any).isSoftDeletedEntity);
    if (this.#orderBy) {
      const { field, direction } = this.#orderBy;
      list.sort((a, b) => compareValues(a[field], b[field], direction));
    }
    return list;
  }

  /** Returns the other relation that points back at us, i.e. we're `Author.image` and this is `Image.author_id`. */
  private getOtherRelation(other: U): ManyToOneReferenceImpl<U, T, any> {
    return (other as U)[this.otherFieldName] as any;
  }

  private get isCascadeDelete(): boolean {
    return isCascadeDelete(this, this.#fieldName);
  }

  private getPreloaded(): U[] | undefined {
    if (this.entity.isNewEntity) return undefined;
    return getEmInternalApi(this.entity.em).getPreloadedRelation<U>(this.entity.idTagged, this.fieldName);
  }

  private registerAsMutated(): void {
    getEmInternalApi(this.entity.em).mutatedCollections.add(this);
  }

  // Exposed for changes
  added(): U[] {
    return this.#added ?? [];
  }

  removed(): U[] {
    return this.#removed ?? [];
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}

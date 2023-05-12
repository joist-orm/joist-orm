
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { RelationT, RelationU } from "./Relation";
import { Reference, ReferenceN } from "./Reference";
import { Entity } from "../Entity";
import { Reacted, ReactiveHint } from "../reactiveHints";
import { Const, IdOf, currentlyInstantiatingEntity } from "../EntityManager";
import { EntityMetadata, ManyToOneField, OneToManyCollection, OneToManyLargeCollection, OneToOneReferenceImpl, deTagId, deTagIds, ensureNotDeleted, ensureTagged, getMetadata, isEntity, isLoaded, maybeResolveReferenceToId, sameEntity, setField } from "..";

const I = Symbol();

export interface PersistedAsyncRelation<T extends Entity, U extends Entity, N extends never | undefined> extends Reference<T, U, N> {
  isLoaded: boolean;
  isSet: boolean;

  /**
   * Returns the as-of-last-flush previously-calculated entity.
   *
   * This is useful if you have to purposefully avoid using the lambda to calc the latest entity,
   * i.e. if you're in a test and want to watch a calculated entity change from some dummy entity
   * to the new derived entity.
   * */
  fieldValue: U | N;

  /** Returns the id of the current assigned entity (or `undefined` if its new and has no id yet), or `undefined` if this column is nullable and currently unset. */
  id: IdOf<U> | undefined;

  /** Returns the id of the current assigned entity or a runtime error if it's either 1) unset or 2) set to a new entity that doesn't have an `id` yet. */
  idOrFail: IdOf<U>;

  idUntagged: string | undefined;

  idUntaggedOrFail: string;

  [I]?: T;
}

export function hasPersistedAsyncRelation<T extends Entity, U extends Entity, H extends ReactiveHint<T>, N extends never | undefined>(
  fieldName: keyof T & string,
  otherFieldName: keyof U & string,
  hint: Const<H>,
  fn: (entity: Reacted<T, H>) => (U | N),
): PersistedAsyncRelation<T, U, N> {
  const entity = currentlyInstantiatingEntity as T;
  return new PersistedAsyncRelationImpl<T, U, H, N>(
    entity,
    fieldName,
    otherFieldName,
    hint,
    fn
  );
}

export class PersistedAsyncRelationImpl<T extends Entity, U extends Entity, H extends ReactiveHint<T>, N extends never | undefined>
  extends AbstractRelationImpl<U>
  implements PersistedAsyncRelation<T, U, N>
{
  readonly #entity: T;
  readonly #fieldName: keyof T & string;
  // Either the loaded entity, or N/undefined if we're allowed to be null
  private loaded!: U | N | undefined;
  // We need a separate boolean to b/c loaded == undefined can still mean "_isLoaded" for nullable fks.
  private _isLoaded = false;
  private loadPromise: any;
  constructor(
    entity: T,
    private fieldName: keyof T & string,
    public otherFieldName: keyof U & string,
    public reactiveHint: Const<H>,
    private fn: (entity: Reacted<T, H>) => U | N,
  ) {
    super();
    this.#entity = entity;
    this.#fieldName = fieldName;
  }

  async load(opts: { withDeleted?: true, forceReload?: true }): Promise<U | N> {
    // ensureNotDeleted(this.#entity, "pending");
    const { loadHint } = this;
    if (!this._isLoaded) {
      return (this.loadPromise ??= this.#entity.em.populate(this.#entity, loadHint).then(() => {
        this._isLoaded = true;
        // Go through `this.get` so that `setField` is called to set our latest value
        return this.doGet(opts);
      }));
    }
    return Promise.resolve(this.doGet(opts));
  }

  private doGet(opts?: { withDeleted?: boolean }): U | N {
    const { fn } = this;
    // ensureNotDeleted(this.#entity, "pending");
    if (this._isLoaded || (!this.isSet && isLoaded(this.#entity, this.loadHint))) {
      const newValue = this.filterDeleted(fn(this.#entity as Reacted<T, H>), opts);
      // It's cheap to set this every time we're called, i.e. even if it's not the
      // official "being called during em.flush" update (...unless we're accessing it
      // during the validate phase of `em.flush`, then skip it to avoid tripping up
      // the "cannot change entities during flush" logic.)
      if (!(this.#entity.em as any)._isValidating) {
        this.set(newValue);
      }
      return this.maybeFindEntity();
    } else if (this.isSet) {
      return this.#entity.__orm.data[this.fieldName];
    } else {
      throw new Error(`${this.fieldName} has not been derived yet`);
    }
  }

  get fieldValue(): U {
    return this.#entity.__orm.data[this.fieldName];
  }

  get getWithDeleted(): U | N {
    return this.doGet({ withDeleted: true });
  }

  get get(): U | N {
    return this.doGet({ withDeleted: false });
  }

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  set(other: U | N): void {
    this.setImpl(other);
  }

  get isSet(): boolean {
    return this.current() !== undefined;
  }

  // Internal method used by OneToManyCollection
  setImpl(other: U | IdOf<U> | N): void {
    ensureNotDeleted(this.#entity, "pending");
    if (sameEntity(other, this.current({ withDeleted: true }))) {
      return;
    }

    // If the project is not using tagged ids, we still want it tagged internally
    other = ensureTagged(this.otherMeta, other);

    const previous = this.maybeFindEntity();
    // Prefer to keep the id in our data hash, but if this is a new entity w/o an id, use the entity itself
    setField(this.#entity, this.fieldName, isEntity(other) ? other?.idTagged ?? other : other);

    if (typeof other === "string") {
      this.loaded = undefined;
      this._isLoaded = false;
    } else {
      this.loaded = other;
      this._isLoaded = true;
    }
    this.maybeRemove(previous);
    this.maybeAdd();
  }

  /** Returns the tagged id of the current value. */
  private get idTagged(): IdOf<U> | N {
    ensureNotDeleted(this.#entity, "pending");
    return maybeResolveReferenceToId(this.current()) as IdOf<U> | N;
  }

  /** Returns the id of the current value. */
  get id(): IdOf<U> | N {
    ensureNotDeleted(this.#entity, "pending");
    // If current is a string, we might need to detag it...
    const id = maybeResolveReferenceToId(this.current()) as IdOf<U> | N;
    if (!this.otherMeta.idTagged && id) {
      return deTagId(this.otherMeta, id) as IdOf<U>;
    }
    return id;
  }

  get idOrFail(): IdOf<U> {
    ensureNotDeleted(this.#entity, "pending");
    return (this.id as IdOf<U> | undefined) || fail("Reference is unset or assigned to a new entity");
  }

  get idUntagged(): string | undefined {
    return this.id && deTagIds(this.otherMeta, [this.id])[0];
  }

  get idUntaggedOrFail(): string {
    return this.idUntagged || fail("Reference is unset or assigned to a new entity");
  }

  get loadHint(): any {
    return getMetadata(this.#entity).config.__data.cachedReactiveLoadHints[this.fieldName];
  }

  // private impl

  setFromOpts(other: U | IdOf<U> | N): void {
    this.setImpl(other);
  }

  initializeForNewEntity(): void {
    // We can be initialized with [entity | id | undefined], and if it's entity or id, then setImpl
    // will set loaded appropriately; but if we're initialized undefined, then mark loaded here
    if (this.current() === undefined) {
      this._isLoaded = true;
    }
  }

  maybeCascadeDelete(): void {
    if (this.isCascadeDelete) {
      const current = this.current({ withDeleted: true });
      if (current !== undefined && typeof current !== "string") {
        this.#entity.em.delete(current as U);
      }
    }
  }

  async cleanupOnEntityDeleted(): Promise<void> {
    const current = await this.load({ withDeleted: true });
    if (current !== undefined) {
      const o2m = this.getOtherRelation(current);
      if (o2m instanceof OneToManyCollection) {
        o2m.remove(this.#entity, { requireLoaded: false });
      } else if (o2m instanceof OneToManyLargeCollection) {
        o2m.remove(this.#entity);
      } else if (o2m instanceof OneToOneReferenceImpl) {
        o2m.set(undefined as any);
      } else {
        throw new Error(`Unhandled ${o2m}`);
      }
    }
    setField(this.#entity, this.fieldName, undefined);
    this.loaded = undefined as any;
    this._isLoaded = true;
  }

  maybeRemove(other: U | undefined) {
    if (other) {
      const prevRelation = this.getOtherRelation(other);
      if (prevRelation instanceof OneToManyCollection) {
        prevRelation.removeIfLoaded(this.#entity);
      } else if (prevRelation instanceof OneToManyLargeCollection) {
        prevRelation.remove(this.#entity);
      } else {
        prevRelation.set(undefined as any, { percolating: true });
      }
    }
  }

  maybeAdd() {
    const id = this.current();
    const other = this.maybeFindEntity();
    if (other) {
      // Other is already loaded in memory, immediately hook it up
      const newRelation = this.getOtherRelation(other);
      if (newRelation instanceof OneToManyCollection) {
        newRelation.add(this.#entity);
      } else if (newRelation instanceof OneToManyLargeCollection) {
        newRelation.add(this.#entity);
      } else {
        newRelation.set(this.#entity, { percolating: true });
      }
    } else if (typeof id === "string") {
      // Other is not loaded in memory, but cache it in case our other side is later loaded
      const { em } = this.#entity;
      let map = em.pendingChildren.get(id);
      if (!map) {
        map = new Map();
        em.pendingChildren.set(id, map);
      }
      let list = map.get(this.otherFieldName);
      if (!list) {
        list = [];
        map.set(this.otherFieldName, list);
      }
      list.push(this.#entity);
    }
  }

  // We need to keep U in data[fieldName] to handle entities without an id assigned yet.
  current(opts?: { withDeleted?: boolean }): U | string | N {
    const current = this.#entity.__orm.data[this.fieldName];
    if (current !== undefined && isEntity(current)) {
      return this.filterDeleted(current as U, opts);
    }
    return current;
  }

  public get otherMeta(): EntityMetadata<U> {
    return (getMetadata(this.#entity).allFields[this.#fieldName] as ManyToOneField).otherMetadata();
  }

  public toString(): string {
    return `PersistedAsyncRelation(entity: ${this.#entity}, hint: ${this.loadHint}, fieldName: ${this.fieldName}, otherMeta: {
      this.otherMeta.type
    }, otherFieldName: ${this.otherFieldName}, id: ${this.id})`;
  }

  /**
   * Removes pending-hard-delete (but not soft-deleted), unless explicitly asked for.
   *
   * Note that we leave soft-deleted entities b/c the call signature of a `book.author.get`
   * very likely does not expect a soft-deleted entity to result in `undefined`.
   *
   * (Contrasted with `author.books.get` which is more intuitive to have soft-deleted
   * entities filtered out, i.e. it doesn't fundamentally change the return type.)
   */
  private filterDeleted(entity: U | N, opts?: { withDeleted?: boolean }): U | N {
    if (entity && (!opts || !opts.withDeleted) && entity.isDeletedEntity) {
      return undefined!;
    }
    return entity;
  }

  /** Returns the other relation that points back at us, i.e. we're `book.author_id` and this is `Author.books`. */
  private getOtherRelation(
    other: U,
  ): OneToManyCollection<U, T> | OneToOneReferenceImpl<U, T> | OneToManyLargeCollection<U, T> {
    return (other as U)[this.otherFieldName] as any;
  }

  private get isCascadeDelete(): boolean {
    return getMetadata(this.#entity).config.__data.cascadeDeleteFields.includes(this.#fieldName as any);
  }

  /**
   * Looks for an entity in `EntityManager`, b/c we may have it in memory even if
   * our reference is not specifically loaded.
   */
  maybeFindEntity(): U | N {
    // Check this.loaded first b/c a new entity won't have an id yet
    const { idTagged } = this;
    return this.loaded ?? (idTagged !== undefined ? this.#entity.em.getEntity(idTagged) as U | N : undefined as N);
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
  [ReferenceN]: N = null!;
}
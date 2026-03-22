import { Entity, isEntity } from "../Entity";
import { IdOf, TaggedId, getEmInternalApi, sameEntity } from "../EntityManager";
import { EntityMetadata, ManyToOneField, getMetadata } from "../EntityMetadata";
import { getField, setField } from "../fields";
import {
  BaseEntity,
  NoIdError,
  OneToManyLargeCollection,
  OneToOneReferenceImpl,
  Reference,
  deTagId,
  ensureNotDeleted,
  ensureTagged,
  fail,
  getInstanceData,
  maybeResolveReferenceToId,
  toIdOf,
  toTaggedId,
} from "../index";
import { lazyField } from "../newEntity";
import { maybeAdd, maybeRemove } from "../utils";
import { AbstractRelationImpl, isCascadeDelete } from "./AbstractRelationImpl";
import { OneToManyCollection } from "./OneToManyCollection";
import { ReferenceN } from "./Reference";
import { RelationT, RelationU } from "./Relation";

/** An alias for creating `ManyToOneReference`s. */
export function hasOne<T extends Entity, U extends Entity, N extends never | undefined>(): ManyToOneReference<T, U, N> {
  return lazyField((entity: T, fieldName) => {
    const m2o = getMetadata(entity).allFields[fieldName] as ManyToOneField;
    return new ManyToOneReferenceImpl<T, U, N>(entity, m2o);
  });
}

/** Type guard utility for determining if an entity field is a ManyToOneReference. */
export function isManyToOneReference(maybeReference: any): maybeReference is ManyToOneReference<any, any, any> {
  return maybeReference instanceof ManyToOneReferenceImpl;
}

export interface ManyToOneReference<T extends Entity, U extends Entity, N extends never | undefined> extends Reference<
  T,
  U,
  N
> {
  /** Returns the id of the current assigned entity, or a runtime error if either 1) unset or 2) set to a new entity that doesn't have an `id` yet. */
  id: IdOf<U>;

  /** Returns the id of the current assigned entity, undefined if unset, or a runtime error if set to a new entity. */
  idIfSet: IdOf<U> | undefined;

  /** Returns the id of the current assigned entity, undefined if unset, or undefined if set to a new entity. */
  idMaybe: IdOf<U> | undefined;

  idUntagged: string;

  idUntaggedIfSet: string | undefined;

  /** Returns `true` if this relation is currently set (i.e. regardless of whether it's loaded, or if it is set but the assigned entity doesn't have an id saved. */
  readonly isSet: boolean;
}

/**
 * Manages a foreign key from one entity to another, i.e. `Book.author --> Author`.
 *
 * We keep the current `author` / `author_id` value in the `__orm.data` hash, where the
 * current value could be either the (string) author id from the database, or an entity
 * `Author` that the user has set.
 *
 * Note that if our `images.author_id` column is unique, this `ManyToOneReference` will essentially
 * be half of a one-to-one relationship, but we'll keep using this `ManyToOneReference` on the "many"
 * side, and the other side, i.e. `Author.image` will use a `OneToOneReference` to point back to us.
 */
export class ManyToOneReferenceImpl<T extends Entity, U extends Entity, N extends never | undefined>
  extends AbstractRelationImpl<T, U>
  implements ManyToOneReference<T, U, N>
{
  readonly #field: ManyToOneField;
  #state: M2OState<U, N>;
  #loadPromise: Promise<void> | undefined;
  #hasBeenSet = false;

  constructor(entity: T, field: ManyToOneField) {
    super(entity);
    this.#field = field;
    this.#state = getInstanceData(entity).isOrWasNew
      ? new M2OLoadedState<U, N>(this, undefined)
      : new M2OUnloadedState<U, N>(this);
  }

  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<U | N> {
    ensureNotDeleted(this.entity, "pending");
    this.#state = this.#state.maybeInstantLoad();
    if (!this.#state.isLoaded || opts.forceReload) {
      const current = this.current();
      if (isEntity(current) || current === undefined) {
        this.#state = new M2OLoadedState<U, N>(this, current as U | N | undefined);
      } else {
        await (this.#loadPromise ??= this.entity.em.load(this.otherMeta.cstr, current).then((entity) => {
          this.#loadPromise = undefined;
          // In extremely rare cases, someone might have called `set` while this promise was in-flight,
          // so make sure our current value is still the same as the fetched entity.
          if (sameEntity(entity, this.current())) {
            this.#state = this.#state.applyLoad(entity);
          }
        }));
      }
    }
    return this.filterDeleted(this.#state.doGet() as U | N, opts);
  }

  set(other: U | N): void {
    this.#setImpl(other);
  }

  get isSet(): boolean {
    return this.current() !== undefined;
  }

  get isLoaded(): boolean {
    // Even if `.load()` has not been called, `.get` will detect
    this.#state = this.#state.maybeInstantLoad();
    return this.#state.isLoaded;
  }

  get isPreloaded(): boolean {
    return !!this.maybeFindEntity();
  }

  preload(): void {
    this.#state = new M2OLoadedState<U, N>(this, this.maybeFindEntity());
  }

  private unload(): void {
    this.#state = new M2OUnloadedState<U, N>(this);
    this.#loadPromise = undefined;
  }

  /** Copy another em's `source` relation into our state. */
  import(source: ManyToOneReferenceImpl<T, U, N>, findEntity: (e: U) => U): void {
    this.#state = source.#state.import(this, findEntity);
  }

  private doGet(opts?: { withDeleted?: boolean }): U | N {
    ensureNotDeleted(this.entity, "pending");
    this.#state = this.#state.maybeInstantLoad();
    return this.filterDeleted(this.#state.doGet() as U | N, opts);
  }

  get getWithDeleted(): U | N {
    return this.doGet({ withDeleted: true });
  }

  get get(): U | N {
    return this.doGet({ withDeleted: false });
  }

  /** Returns the id of the current value. */
  get id(): IdOf<U> {
    return this.idMaybe || failNoId(this.entity, this.fieldName, this.current());
  }

  /** Sets the m2o to `id`, and allows accepting `undefined` (`N`) if this is a nullable relation. */
  set id(id: IdOf<U> | N) {
    ensureNotDeleted(this.entity, "pending");
    const newId = toTaggedId(this.otherMeta, id);

    const previousId = this.idTaggedMaybe;
    const previous = this.maybeFindEntity();
    const changed = setField(this.entity, this.fieldName, id);
    if (!changed) {
      return;
    }

    const loaded = newId ? (this.entity.em.getEntity(newId) as U) : undefined;
    this.#state = loaded ? new M2OLoadedState<U, N>(this, loaded) : new M2OUnloadedState<U, N>(this);
    this.#loadPromise = undefined;
    this.#percolateRemove(previousId, previous);
    this.#percolateAdd();
  }

  get idIfSet(): IdOf<U> | N | undefined {
    return this.idMaybe || failIfNewEntity(this.entity, this.fieldName, this.current());
  }

  get idUntagged(): string {
    return this.idUntaggedMaybe || failNoId(this.entity, this.fieldName, this.current());
  }

  get idUntaggedIfSet(): string | undefined {
    return this.idUntaggedMaybe || failIfNewEntity(this.entity, this.fieldName, this.current());
  }

  get idMaybe(): IdOf<U> | N | undefined {
    ensureNotDeleted(this.entity, "pending");
    return toIdOf(this.otherMeta, this.idTaggedMaybe);
  }

  /** Returns the tagged id of the current value, or undefined if unset or a new entity. */
  get idTaggedMaybe(): TaggedId | undefined {
    // Skip the deleted check so that `isPreloaded` doesn't blow up during em.refreshes/populates
    // ensureNotDeleted(this.entity, "pending");
    return maybeResolveReferenceToId(this.current());
  }

  get fieldName(): string {
    return this.#field.fieldName;
  }

  get otherFieldName(): keyof U & string {
    return this.#field.otherFieldName as keyof U & string;
  }

  private get idUntaggedMaybe(): string | undefined {
    return deTagId(this.otherMeta, this.idMaybe);
  }

  #setImpl(_other: U | IdOf<U> | N): void {
    ensureNotDeleted(this.entity, "pending");
    this.#hasBeenSet = true;

    // If the project is not using tagged ids, we still want it tagged internally
    const other = ensureTagged(this.otherMeta, _other);
    if (sameEntity(other, this.current({ withDeleted: true }))) {
      return;
    }

    const previousId = this.idTaggedMaybe;
    const previous = this.maybeFindEntity();
    // Prefer to keep the id in our data hash, but if this is a new entity w/o an id, use the entity itself
    setField(this.entity, this.fieldName, isEntity(other) ? (other?.idTaggedMaybe ?? other) : other);

    // Setting to an entity | undefined => loaded, setting to an id might reverse to unloaded
    const maybeEntity = isEntity(other) ? (other as U) : other ? this.entity.em.getEntity(other) : undefined;
    if (maybeEntity || other === undefined) {
      this.#state = new M2OLoadedState<U, N>(this, (maybeEntity ?? other) as U | N);
    } else {
      this.#state = new M2OUnloadedState<U, N>(this);
    }
    this.#loadPromise = undefined;
    this.#percolateRemove(previousId, previous);
    this.#percolateAdd();
  }

  // private impl

  setFromOpts(other: U | IdOf<U> | N): void {
    this.#setImpl(other);
  }

  maybeCascadeDelete(): void {
    if (this.isCascadeDelete) {
      const current = this.current({ withDeleted: true });
      if (current !== undefined && typeof current !== "string") {
        this.entity.em.delete(current as U);
      }
    }
  }

  async cleanupOnEntityDeleted(): Promise<void> {
    // if we are going to delete this relation as well, then we don't need to clean it up
    if (this.isCascadeDelete) return;
    const current = await this.load({ withDeleted: true });
    if (current !== undefined) {
      const o2m = this.getOtherRelation(current);
      if (o2m instanceof OneToManyCollection) {
        o2m.remove(this.entity, { requireLoaded: false });
      } else if (o2m instanceof OneToManyLargeCollection) {
        o2m.remove(this.entity);
      } else if (o2m instanceof OneToOneReferenceImpl) {
        o2m.set(undefined as any);
      } else {
        throw new Error(`Unhandled ${o2m}`);
      }
    }
    setField(this.entity, this.fieldName, undefined);
    this.#state = new M2OLoadedState<U, N>(this, undefined as any);
  }

  // Called on `book.author.set(...)` with our previous value, to percolate a `author.books.remove`. */
  #percolateRemove(prevId: string | undefined, prevEntity: U | undefined) {
    if (prevEntity) {
      const prevRelation = this.getOtherRelation(prevEntity);
      if (prevRelation instanceof OneToManyCollection) {
        prevRelation.removeIfLoaded(this.entity);
      } else if (prevRelation instanceof OneToManyLargeCollection) {
        prevRelation.remove(this.entity);
      } else {
        prevRelation.set(undefined as any, { percolating: true });
      }
    } else if (prevId) {
      // prevEntity is not loaded in memory, but cache it in case our other side is later loaded
      const { em } = this.entity;
      let map = getEmInternalApi(em).pendingPercolate.get(prevId);
      if (!map) {
        map = new Map();
        getEmInternalApi(em).pendingPercolate.set(prevId, map);
      }
      let pending = map.get(this.otherFieldName);
      if (!pending) {
        pending = { adds: [], removes: [] };
        map.set(this.otherFieldName, pending);
      }
      maybeAdd(pending.removes, this.entity);
      maybeRemove(pending.adds, this.entity);
    }
  }

  #percolateAdd() {
    const id = this.current();
    const other = this.maybeFindEntity();
    if (other) {
      // Other is already loaded in memory, immediately hook it up
      const newRelation = this.getOtherRelation(other);
      if (newRelation instanceof OneToManyCollection) {
        newRelation.add(this.entity);
      } else if (newRelation instanceof OneToManyLargeCollection) {
        newRelation.add(this.entity);
      } else if (newRelation) {
        newRelation.set(this.entity, { percolating: true });
      } else {
        // Something is wrong, we should always have a relation, but instead
        // of blowing up here, let this finish b/c it will probably turn into
        // a validation error.
      }
    } else if (typeof id === "string") {
      // Other is not loaded in memory, but cache it in case our other side is later loaded
      const { em } = this.entity;
      let map = getEmInternalApi(em).pendingPercolate.get(id);
      if (!map) {
        map = new Map();
        getEmInternalApi(em).pendingPercolate.set(id, map);
      }
      let pending = map.get(this.otherFieldName);
      if (!pending) {
        pending = { adds: [], removes: [] };
        map.set(this.otherFieldName, pending);
      }
      maybeAdd(pending.adds, this.entity);
      maybeRemove(pending.removes, this.entity);
    }
  }

  // We need to keep U in data[fieldName] to handle entities without an id assigned yet.
  current(opts?: { withDeleted?: boolean }): U | TaggedId | N {
    const current = getField(this.entity, this.fieldName);
    if (current !== undefined && isEntity(current)) {
      return this.filterDeleted(current as U, opts);
    }
    return current;
  }

  get otherMeta(): EntityMetadata<U> {
    return this.#field.otherMetadata();
  }

  get hasBeenSet(): boolean {
    return this.#hasBeenSet;
  }

  public toString(): string {
    return `ManyToOneReference(entity: ${this.entity}, fieldName: ${this.fieldName}, otherType: ${this.otherMeta.type}, otherFieldName: ${this.otherFieldName}, id: ${this.idMaybe})`;
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
    return isCascadeDelete(this, this.fieldName);
  }

  /**
   * Looks for an entity in `EntityManager`, b/c we may have it in memory even if
   * our reference is not specifically loaded.
   */
  maybeFindEntity(): U | undefined {
    // Check current() first b/c a new entity won't have an id yet
    const current = this.current();
    if (isEntity(current)) return current as U;
    const { idTaggedMaybe } = this;
    return idTaggedMaybe !== undefined ? (this.entity.em.getEntity(idTaggedMaybe) as U) : undefined;
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
  [ReferenceN]: N = null!;
}

/**
 * Fails when we can't return an `.id` for a reference, i.e. it's unset or a new entity.
 *
 * We strictly type `book.author.id` as `AuthorId`, even if `book.author` is nullable, to
 * avoid users calling `.id` and getting back `undefined`, but not because "there is no
 * author", but only because "the assigned author doesn't have an id assigned yet".
 *
 * To handle nullable references, set `.idIfSet`.
 *
 * Assumes being called like `return idMaybe ?? failNoId()`, i.e. if we're called we
 * know the id is not available.
 */
export function failNoId(entity: Entity, fieldName: string, current: string | Entity | undefined): never {
  if (!current) fail(`Reference ${entity}.${fieldName} is unset`);
  // Throw NoIdError, which lets ReactionsManager will handle reactive fields gracefully
  if (current instanceof BaseEntity)
    throw new NoIdError(`Reference ${entity}.${fieldName} is assigned to a new entity`);
  fail(`Unreachable`);
}

/**
 * Fails when we can't return an `.idIfSet` for a reference, i.e. it's a new entity.
 *
 * Assumes being called like `return idMaybe ?? failIfNewEntity()`, i.e. if we're called we
 * know the id is not available.
 */
export function failIfNewEntity(entity: Entity, fieldName: string, current: string | Entity | undefined): undefined {
  if (current instanceof BaseEntity) {
    throw new NoIdError(`Reference ${entity}.${fieldName} is assigned to a new entity`);
  }
  // Since this is a `.idIfSet`, having no `current` is fine, return undefined.
  return undefined;
}

interface M2OState<U extends Entity, N extends never | undefined> {
  readonly isLoaded: boolean;
  maybeInstantLoad(): M2OState<U, N>;
  applyLoad(loaded: U | N | undefined): M2OLoadedState<U, N>;
  import(target: ManyToOneReferenceImpl<any, any, any>, findEntity: (e: U) => U): M2OState<U, N>;
  doGet(): U | N | undefined;
}

class M2OUnloadedState<U extends Entity, N extends never | undefined> implements M2OState<U, N> {
  readonly isLoaded = false;
  #m2o: ManyToOneReferenceImpl<any, any, any>;
  constructor(m2o: ManyToOneReferenceImpl<any, any, any>) {
    this.#m2o = m2o;
  }
  applyLoad(loaded: U | N | undefined): M2OLoadedState<U, N> {
    return new M2OLoadedState<U, N>(this.#m2o, loaded);
  }
  import(target: ManyToOneReferenceImpl<any, any, any>): M2OState<U, N> {
    return new M2OUnloadedState<U, N>(target);
  }
  maybeInstantLoad(): M2OState<U, N> {
    const current = this.#m2o.current();
    if (current === undefined || isEntity(current)) {
      return new M2OLoadedState<U, N>(this.#m2o, current as U | undefined);
    } else {
      const maybeFound = this.#m2o.entity.em.getEntity(current);
      if (maybeFound) {
        return new M2OLoadedState<U, N>(this.#m2o, maybeFound as U);
      }
    }
    return this;
  }
  doGet(): U | N | undefined {
    throw new Error(`${this.#m2o.entity}.${this.#m2o.fieldName} was not loaded`);
  }
}

/** The when loaded, with either the loaded entity or undefined. */
class M2OLoadedState<U extends Entity, N extends never | undefined> implements M2OState<U, N> {
  readonly isLoaded = true;
  #m2o: ManyToOneReferenceImpl<any, any, any>;
  #loaded: U | N | undefined;
  constructor(m2o: ManyToOneReferenceImpl<any, any, any>, loaded: U | N | undefined) {
    this.#loaded = loaded;
    this.#m2o = m2o;
  }
  applyLoad(loaded: U | N | undefined): M2OLoadedState<U, N> {
    return new M2OLoadedState<U, N>(this.#m2o, loaded);
  }
  import(target: ManyToOneReferenceImpl<any, any, any>, findEntity: (e: U) => U): M2OState<U, N> {
    return new M2OLoadedState<U, N>(target, isEntity(this.#loaded) ? findEntity(this.#loaded) : undefined);
  }
  maybeInstantLoad(): M2OState<U, N> {
    return this;
  }
  doGet(): U | N | undefined {
    return this.#loaded;
  }
}

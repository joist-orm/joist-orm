import { Entity, isEntity, isOrWasNew } from "../Entity";
import { IdOf, TaggedId, getEmInternalApi, sameEntity } from "../EntityManager";
import { EntityMetadata, ManyToOneField, getMetadata } from "../EntityMetadata";
import { getField, setField } from "../fields";
import {
  BaseEntity,
  OneToManyLargeCollection,
  OneToOneReferenceImpl,
  Reference,
  deTagId,
  ensureNotDeleted,
  ensureTagged,
  fail,
  maybeResolveReferenceToId,
  toIdOf,
  toTaggedId,
} from "../index";
import { maybeAdd, maybeRemove } from "../utils";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { OneToManyCollection } from "./OneToManyCollection";
import { ReferenceN } from "./Reference";
import { RelationT, RelationU } from "./Relation";

/** An alias for creating `ManyToOneReference`s. */
export function hasOne<T extends Entity, U extends Entity, N extends never | undefined>(
  entity: T,
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T & string,
  otherFieldName: keyof U & string,
): ManyToOneReference<T, U, N> {
  return new ManyToOneReferenceImpl<T, U, N>(entity, otherMeta, fieldName, otherFieldName);
}

/** Type guard utility for determining if an entity field is a ManyToOneReference. */
export function isManyToOneReference(maybeReference: any): maybeReference is ManyToOneReference<any, any, any> {
  return maybeReference instanceof ManyToOneReferenceImpl;
}

export interface ManyToOneReference<T extends Entity, U extends Entity, N extends never | undefined>
  extends Reference<T, U, N> {
  /** Returns the id of the current assigned entity, or a runtime error if either 1) unset or 2) set to a new entity that doesn't have an `id` yet. */
  id: IdOf<U>;

  /** Returns the id of the current assigned entity, undefined if unset, or a runtime error if set to a new entity. */
  idIfSet: IdOf<U> | undefined;

  /** Returns the id of the current assigned entity, undefined if unset, or undefined if set to a new entity. */
  idMaybe: IdOf<U> | undefined;

  idUntagged: string;

  idUntaggedIfSet: string | undefined;

  /** Returns `true` if this relation is currently set (i.e. regardless of whether it's loaded, or if it is set but the assigned entity doesn't have an id saved). */
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
  readonly #fieldName: keyof T & string;
  // Either the loaded entity, or N/undefined if we're allowed to be null
  private loaded!: U | N | undefined;
  // We need a separate boolean to b/c loaded == undefined can still mean "_isLoaded" for nullable fks.
  private _isLoaded = false;

  constructor(
    entity: T,
    otherMeta: EntityMetadata,
    private fieldName: keyof T & string,
    public otherFieldName: keyof U & string,
  ) {
    super(entity);
    this.#fieldName = fieldName;
    if (isOrWasNew(entity)) {
      this._isLoaded = true;
    }
  }

  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<U | N> {
    ensureNotDeleted(this.entity, "pending");
    if (this._isLoaded && this.loaded && !opts.forceReload) {
      return this.loaded;
    }
    const current = this.current();
    // Resolve the id to an entity
    if (!isEntity(current) && current !== undefined) {
      this.loaded = (await this.entity.em.load(this.otherMeta.cstr, current)) as any as U;
    } else {
      this.loaded = current;
    }
    this._isLoaded = true;
    return this.filterDeleted(this.loaded!, opts);
  }

  set(other: U | N): void {
    this.setImpl(other);
  }

  get isSet(): boolean {
    return this.current() !== undefined;
  }

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  get isPreloaded(): boolean {
    return !!this.maybeFindEntity();
  }

  preload(): void {
    this.loaded = this.maybeFindEntity();
    this._isLoaded = true;
  }

  private doGet(opts?: { withDeleted?: boolean }): U | N {
    ensureNotDeleted(this.entity, "pending");
    // This should only be callable in the type system if we've already resolved this to an instance,
    // but, just in case we somehow got here in an unloaded state, check to see if we're already in the UoW
    if (!this._isLoaded) {
      const existing = this.maybeFindEntity();
      if (existing === undefined) {
        throw new Error(`${this.entity}.${this.fieldName} was not loaded`);
      }
      this.loaded = existing;
      this._isLoaded = true;
    }

    return this.filterDeleted(this.loaded!, opts);
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

    this.loaded = newId ? (this.entity.em.getEntity(newId) as U) : undefined;
    this._isLoaded = !!this.loaded;
    this.maybeRemove(previousId, previous);
    this.maybeAdd();
  }

  get idIfSet(): IdOf<U> | N | undefined {
    failIfNewEntity(this.entity, this.fieldName, this.current());
    return this.idMaybe;
  }

  get idUntagged(): string {
    return this.idUntaggedMaybe || failNoId(this.entity, this.fieldName, this.current());
  }

  get idUntaggedIfSet(): string | undefined {
    failIfNewEntity(this.entity, this.fieldName, this.current());
    return this.idUntaggedMaybe;
  }

  get idMaybe(): IdOf<U> | N | undefined {
    ensureNotDeleted(this.entity, "pending");
    return toIdOf(this.otherMeta, this.idTaggedMaybe);
  }

  /** Returns the tagged id of the current value. */
  get idTaggedMaybe(): TaggedId | undefined {
    ensureNotDeleted(this.entity, "pending");
    return maybeResolveReferenceToId(this.current());
  }

  private get idUntaggedMaybe(): string | undefined {
    return deTagId(this.otherMeta, this.idMaybe);
  }

  // Internal method used by OneToManyCollection
  setImpl(_other: U | IdOf<U> | N): void {
    ensureNotDeleted(this.entity, "pending");
    // If the project is not using tagged ids, we still want it tagged internally
    const other = ensureTagged(this.otherMeta, _other);

    if (sameEntity(other, this.current({ withDeleted: true }))) {
      return;
    }

    const previousId = this.idTaggedMaybe;
    const previous = this.maybeFindEntity();
    // Prefer to keep the id in our data hash, but if this is a new entity w/o an id, use the entity itself
    setField(this.entity, this.fieldName, isEntity(other) ? other?.idTaggedMaybe ?? other : other);

    if (typeof other === "string") {
      this.loaded = undefined;
      this._isLoaded = false;
    } else {
      this.loaded = other as U | N;
      this._isLoaded = true;
    }
    this.maybeRemove(previousId, previous);
    this.maybeAdd();
  }

  // private impl

  setFromOpts(other: U | IdOf<U> | N): void {
    this.setImpl(other);
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
    this.loaded = undefined as any;
    this._isLoaded = true;
  }

  maybeRemove(otherId: string | undefined, other: U | undefined) {
    if (other) {
      const prevRelation = this.getOtherRelation(other);
      if (prevRelation instanceof OneToManyCollection) {
        prevRelation.removeIfLoaded(this.entity);
      } else if (prevRelation instanceof OneToManyLargeCollection) {
        prevRelation.remove(this.entity);
      } else {
        prevRelation.set(undefined as any, { percolating: true });
      }
    } else if (otherId) {
      // Other is not loaded in memory, but cache it in case our other side is later loaded
      const { em } = this.entity;
      let map = getEmInternalApi(em).pendingChildren.get(otherId);
      if (!map) {
        map = new Map();
        getEmInternalApi(em).pendingChildren.set(otherId, map);
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

  maybeAdd() {
    const id = this.current();
    const other = this.maybeFindEntity();
    if (other) {
      // Other is already loaded in memory, immediately hook it up
      const newRelation = this.getOtherRelation(other);
      if (newRelation instanceof OneToManyCollection) {
        newRelation.add(this.entity);
      } else if (newRelation instanceof OneToManyLargeCollection) {
        newRelation.add(this.entity);
      } else {
        newRelation.set(this.entity, { percolating: true });
      }
    } else if (typeof id === "string") {
      // Other is not loaded in memory, but cache it in case our other side is later loaded
      const { em } = this.entity;
      let map = getEmInternalApi(em).pendingChildren.get(id);
      if (!map) {
        map = new Map();
        getEmInternalApi(em).pendingChildren.set(id, map);
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

  public get otherMeta(): EntityMetadata<U> {
    return (getMetadata(this.entity).allFields[this.#fieldName] as ManyToOneField).otherMetadata();
  }

  public toString(): string {
    return `${this.entity}.${this.fieldName}`;
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
    return getMetadata(this.entity).config.__data.cascadeDeleteFields.includes(this.#fieldName as any);
  }

  /**
   * Looks for an entity in `EntityManager`, b/c we may have it in memory even if
   * our reference is not specifically loaded.
   */
  maybeFindEntity(): U | undefined {
    // Check this.loaded first b/c a new entity won't have an id yet
    const { idTaggedMaybe } = this;
    return this.loaded ?? (idTaggedMaybe !== undefined ? (this.entity.em.getEntity(idTaggedMaybe) as U) : undefined);
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
  [ReferenceN]: N = null!;
}

/** Fails when we can't return an id for a reference, i.e. it's unset or a new entity. */
export function failNoId(entity: Entity, fieldName: string, current: string | Entity | undefined): never {
  if (!current) fail(`Reference ${entity}.${fieldName} is unset`);
  if (current instanceof BaseEntity && current.isNewEntity)
    fail(`Reference ${entity}.${fieldName} is assigned to a new entity`);
  fail(`Reference ${entity}.${fieldName} is unset or assigned to a new entity`);
}

/** Fails when we can't return an id for a reference, i.e. it's unset or a new entity. */
export function failIfNewEntity<U>(entity: Entity, fieldName: string, current: string | Entity | undefined): void {
  if (current instanceof BaseEntity && current.isNewEntity) {
    fail(`Reference ${entity}.${fieldName} is assigned to a new entity`);
  }
}

import { Entity, isEntity } from "../Entity";
import { currentlyInstantiatingEntity, IdOf, sameEntity } from "../EntityManager";
import { EntityMetadata } from "../EntityMetadata";
import {
  deTagIds,
  ensureNotDeleted,
  fail,
  maybeResolveReferenceToId,
  OneToManyLargeCollection,
  OneToOneReferenceImpl,
  Reference,
  setField,
} from "../index";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { OneToManyCollection } from "./OneToManyCollection";
import { ReferenceN } from "./Reference";
import { RelationT, RelationU } from "./Relation";

/** An alias for creating `ManyToOneReference`s. */
export function hasOne<T extends Entity, U extends Entity, N extends never | undefined>(
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T & string,
  otherFieldName: keyof U & string,
): ManyToOneReference<T, U, N> {
  const entity = currentlyInstantiatingEntity as T;
  return new ManyToOneReferenceImpl<T, U, N>(entity, otherMeta, fieldName, otherFieldName);
}

/** Type guard utility for determining if an entity field is a ManyToOneReference. */
export function isManyToOneReference(maybeReference: any): maybeReference is ManyToOneReference<any, any, any> {
  return maybeReference instanceof ManyToOneReferenceImpl;
}

export interface ManyToOneReference<T extends Entity, U extends Entity, N extends never | undefined>
  extends Reference<T, U, N> {
  /** Returns the id of the current assigned entity (or `undefined` if its new and has no id yet), or `undefined` if this column is nullable and currently unset. */
  id: IdOf<U> | undefined;

  /** Returns the id of the current assigned entity or a runtime error if it's either 1) unset or 2) set to a new entity that doesn't have an `id` yet. */
  idOrFail: IdOf<U>;

  idUntagged: string | undefined;

  idUntaggedOrFail: string;

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
  extends AbstractRelationImpl<U>
  implements ManyToOneReference<T, U, N>
{
  // Either the loaded entity, or N/undefined if we're allowed to be null
  private loaded!: U | N | undefined;
  // We need a separate boolean to b/c loaded == undefined can still mean "_isLoaded" for nullable fks.
  private _isLoaded = false;
  private readonly isCascadeDelete: boolean;

  constructor(
    private entity: T,
    public otherMeta: EntityMetadata<U>,
    private fieldName: keyof T & string,
    public otherFieldName: keyof U & string,
  ) {
    super();
    this.isCascadeDelete = otherMeta?.config.__data.cascadeDeleteFields.includes(fieldName as any);
  }

  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<U | N> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
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

  private doGet(opts?: { withDeleted?: boolean }): U | N {
    ensureNotDeleted(this.entity, { ignore: "pending" });
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

  get id(): IdOf<U> | N {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    return maybeResolveReferenceToId(this.current()) as IdOf<U> | N;
  }

  set id(id: IdOf<U> | N) {
    ensureNotDeleted(this.entity, { ignore: "pending" });

    const previous = this.maybeFindEntity();
    const changed = setField(this.entity, this.fieldName, id);
    if (!changed) {
      return;
    }

    this.loaded = id ? this.entity.em.getEntity(id) : undefined;
    this._isLoaded = !!this.loaded;
    this.maybeRemove(previous);
    this.maybeAdd(this.maybeFindEntity());
  }

  // Internal method used by OneToManyCollection
  setImpl(other: U | IdOf<U> | N): void {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (sameEntity(other, this.otherMeta, this.current())) {
      return;
    }

    const previous = this.maybeFindEntity();
    // Prefer to keep the id in our data hash, but if this is a new entity w/o an id, use the entity itself
    setField(this.entity, this.fieldName, isEntity(other) ? other?.id ?? other : other);

    if (typeof other === "string") {
      this.loaded = undefined;
      this._isLoaded = false;
    } else {
      this.loaded = other;
      this._isLoaded = true;
    }
    this.maybeRemove(previous);
    this.maybeAdd(this.maybeFindEntity());
  }

  get idOrFail(): IdOf<U> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    return (this.id as IdOf<U> | undefined) || fail("Reference is unset or assigned to a new entity");
  }

  get idUntagged(): string | undefined {
    return this.id && deTagIds(this.otherMeta, [this.id])[0];
  }

  get idUntaggedOrFail(): string {
    return this.idUntagged || fail("Reference is unset or assigned to a new entity");
  }

  // private impl

  setFromOpts(other: U): void {
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
        this.entity.em.delete(current as U);
      }
    }
  }

  async cleanupOnEntityDeleted(): Promise<void> {
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

  maybeRemove(other: U | undefined) {
    if (other) {
      const prevRelation = this.getOtherRelation(other);
      if (prevRelation instanceof OneToManyCollection) {
        prevRelation.removeIfLoaded(this.entity);
      } else if (prevRelation instanceof OneToManyLargeCollection) {
        prevRelation.remove(this.entity);
      } else {
        prevRelation.set(undefined as any, { percolating: true });
      }
    }
  }

  maybeAdd(other: U | undefined) {
    if (other) {
      const newRelation = this.getOtherRelation(other);
      if (newRelation instanceof OneToManyCollection) {
        newRelation.add(this.entity);
      } else if (newRelation instanceof OneToManyLargeCollection) {
        newRelation.add(this.entity);
      } else {
        newRelation.set(this.entity, { percolating: true });
      }
    }
  }

  // We need to keep U in data[fieldName] to handle entities without an id assigned yet.
  current(opts?: { withDeleted?: boolean }): U | string | N {
    const current = this.entity.__orm.data[this.fieldName];
    if (current !== undefined && isEntity(current)) {
      return this.filterDeleted(current as U, opts);
    }
    return current;
  }

  public toString(): string {
    return `ManyToOneReference(entity: ${this.entity}, fieldName: ${this.fieldName}, otherType: ${this.otherMeta.type}, otherFieldName: ${this.otherFieldName}, id: ${this.id})`;
  }

  private filterDeleted(entity: U | N, opts?: { withDeleted?: boolean }): U | N {
    return opts?.withDeleted === true || entity === undefined || !entity.isDeletedEntity ? entity : (undefined as N);
  }

  /** Returns the other relation that points back at us, i.e. we're `book.author_id` and this is `Author.books`. */
  private getOtherRelation(
    other: U,
  ): OneToManyCollection<U, T> | OneToOneReferenceImpl<U, T> | OneToManyLargeCollection<U, T> {
    return (other as U)[this.otherFieldName] as any;
  }

  /**
   * Looks for an entity in `EntityManager`, b/c we may have it in memory even if
   * our reference is not specifically loaded.
   */
  maybeFindEntity(): U | undefined {
    // Check this.loaded first b/c a new entity won't have an id yet
    return this.loaded ?? (this.id !== undefined ? this.entity.em.getEntity(this.id) : undefined);
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
  [ReferenceN]: N = null!;
}

import { deTagId, ensureNotDeleted, getEmInternalApi, IdOf, LoadedReference, TaggedId } from "../";
import { oneToOneDataLoader } from "../dataloaders/oneToOneDataLoader";
import { Entity, isOrWasNew } from "../Entity";
import { EntityMetadata, getMetadata } from "../EntityMetadata";
import { setField } from "../fields";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { failIfNewEntity, failNoId, ManyToOneReference } from "./ManyToOneReference";
import { Reference, ReferenceN } from "./Reference";
import { RelationT, RelationU } from "./Relation";

const OneToOne = Symbol();

/** The lazy-loaded/lookup side of a one-to-one, i.e. the side w/o the unique foreign key column. */
export interface OneToOneReference<T extends Entity, U extends Entity> extends Reference<T, U, undefined> {
  // Need to differentiate OneToOneReference from Reference
  [OneToOne]: T;
}

/** Adds a known-safe `get` accessor. */
export interface LoadedOneToOneReference<T extends Entity, U extends Entity> extends LoadedReference<T, U, undefined> {
  get: U | undefined;

  getWithDeleted: U | undefined;

  // Once OneToOneReference is loaded, it can get a lot of the ManyToOneReference methods that
  // are available even in an unloaded state; below is mostly a copy/paste of those.

  /** Returns the id of the current assigned entity or a runtime error if it's either a) unset or b) set to a new entity that doesn't have an `id` yet. */
  id: IdOf<U>;

  idIfSet: IdOf<U> | undefined;

  idUntagged: string;

  idUntaggedMaybe: string | undefined;

  /** Returns `true` if this relation is currently set (i.e. regardless of whether it's loaded, or if it is set but the assigned entity doesn't have an id saved. */
  readonly isSet: boolean;
}

/** Type guard utility for determining if an entity field is a Reference. */
export function isOneToOneReference(maybeReference: any): maybeReference is OneToOneReference<any, any> {
  return maybeReference instanceof OneToOneReferenceImpl;
}

/** Type guard utility for determining if an entity field is a loaded Reference. */
export function isLoadedOneToOneReference(
  maybeReference: any,
): maybeReference is Reference<any, any, any> & LoadedOneToOneReference<any, any> {
  return isOneToOneReference(maybeReference) && maybeReference.isLoaded;
}

/** An alias for creating `OneToOneReference`s. */
export function hasOneToOne<T extends Entity, U extends Entity>(
  entity: T,
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T & string,
  otherFieldName: keyof U & string,
  otherColumnName: string,
): OneToOneReference<T, U> {
  return new OneToOneReferenceImpl<T, U>(entity, otherMeta, fieldName, otherFieldName, otherColumnName);
}

/**
 * Represents the "many" side of a one-to-one relationship.
 *
 * I.e. in a one-to-many from Book -> Reviews, there is a review.book_id that can have many books.
 *
 * This class is for when that `review.book_id` column is itself unique, i.e. like `image.book_id`, and
 * so instead of `Book.images: OneToManyCollection` we have a `Book.image: OneToOneReference`.
 *
 * This class implements `Reference` because it is essentially like "one entity pointing/refereing to another",
 * however because we require a `.load` call to lazily know the value of other side (unlike ManyToOneReference
 * which has it's `book_id` column immediately available in the entity `data` hash), there is some wonkiness
 * around methods like `Reference.id` that are usually callable without `load`/`populate`, that for this
 * class can actually only be called post `load`/`populate`.
 *
 * Currently we enforce this with a runtime check, which is not great, but the trade-off of implementing
 * `Reference` seemed worth the downside of a un-type-safe `.id` property.
 */
export class OneToOneReferenceImpl<T extends Entity, U extends Entity>
  extends AbstractRelationImpl<T, U>
  implements OneToOneReference<T, U>
{
  private loaded: U | undefined;
  private _isLoaded: boolean = false;
  private isCascadeDelete: boolean;
  readonly #otherMeta: EntityMetadata;

  constructor(
    // These are public to our internal implementation but not exposed in the Collection API
    entity: T,
    otherMeta: EntityMetadata,
    public fieldName: keyof T & string,
    public otherFieldName: keyof U & string,
    public otherColumnName: string,
  ) {
    super(entity);
    this.#otherMeta = otherMeta;
    this.isCascadeDelete = getMetadata(entity).config.__data.cascadeDeleteFields.includes(fieldName as any);
    if (isOrWasNew(entity)) {
      this._isLoaded = true;
    }
  }

  get id(): IdOf<U> {
    return this.idMaybe || failNoId(this.entity, this.fieldName, this.loaded);
  }

  get idIfSet(): IdOf<U> | undefined {
    if (this._isLoaded) {
      failIfNewEntity(this.entity, this.fieldName, this.loaded);
      return this.idMaybe;
    }
    throw new Error(`${this.entity}.${this.fieldName} was not loaded`);
  }

  get idUntagged(): string {
    return this.idUntaggedMaybe || failNoId(this.entity, this.fieldName, this.loaded);
  }

  get idUntaggedIfSet(): string | undefined {
    failIfNewEntity(this.entity, this.fieldName, this.loaded);
    return this.idUntaggedMaybe;
  }

  private get idMaybe(): IdOf<U> | undefined {
    ensureNotDeleted(this.entity, "pending");
    if (this._isLoaded) {
      return this.loaded?.idMaybe as IdOf<U> | undefined;
    }
    throw new Error(`${this.entity}.${this.fieldName} was not loaded`);
  }

  get idTaggedMaybe(): TaggedId | undefined {
    ensureNotDeleted(this.entity, "pending");
    if (this._isLoaded) {
      return this.loaded?.idTaggedMaybe;
    }
    throw new Error(`${this.entity}.${this.fieldName} was not loaded`);
  }

  private get idUntaggedMaybe(): string | undefined {
    return deTagId(this.#otherMeta, this.idMaybe);
  }

  get isSet(): boolean {
    if (this._isLoaded) {
      return this.loaded !== undefined;
    }
    throw new Error(`${this.entity}.${this.fieldName} was not loaded`);
  }

  // opts is an internal parameter
  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<U | undefined> {
    ensureNotDeleted(this.entity, "pending");
    if (!this._isLoaded || opts.forceReload) {
      if (!this.entity.isNewEntity) {
        const joinLoaded = this.getPreloaded();
        this.loaded = joinLoaded
          ? joinLoaded[0]
          : await oneToOneDataLoader(this.entity.em, this).load(this.entity.idTagged);
      }
      this._isLoaded = true;
    }
    return this.filterDeleted(this.loaded, opts);
  }

  set(other: U, opts: { percolating?: boolean } = {}): void {
    ensureNotDeleted(this.entity, "pending");
    if (other === this.loaded) {
      return;
    }
    if (this._isLoaded) {
      if (this.loaded && !opts.percolating) {
        this.getOtherRelation(this.loaded).set(undefined);
      }
    }
    this.loaded = other;
    this._isLoaded = true;
    // This will no-op and mark other dirty if necessary
    if (other && !opts.percolating) {
      this.getOtherRelation(other).set(this.entity);
    }
  }

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  get isPreloaded(): boolean {
    return !!this.getPreloaded();
  }

  preload(): void {
    this.loaded = this.getPreloaded()?.[0];
    this._isLoaded = true;
  }

  get getWithDeleted(): U | undefined {
    return this.filterDeleted(this.doGet(), { withDeleted: true });
  }

  get get(): U | undefined {
    return this.filterDeleted(this.doGet(), { withDeleted: false });
  }

  get otherMeta(): EntityMetadata {
    return this.#otherMeta;
  }

  private doGet(): U | undefined {
    ensureNotDeleted(this.entity, "pending");
    if (!this._isLoaded) {
      // This should only be callable in the type system if we've already resolved this to an instance
      throw new Error("get was called when not loaded");
    }
    return this.loaded;
  }

  // internal impl

  setFromOpts(other: U): void {
    this.set(other);
  }

  maybeCascadeDelete(): void {
    if (this.isCascadeDelete && this.loaded) {
      this.entity.em.delete(this.loaded);
    }
  }

  async cleanupOnEntityDeleted(): Promise<void> {
    // if we are going to delete this relation as well, then we don't need to clean it up
    if (this.isCascadeDelete) return;
    const current = await this.load({ withDeleted: true });
    if (current !== undefined) {
      this.getOtherRelation(current).set(undefined as any);
      setField(current, this.otherFieldName, undefined);
    }
    this.loaded = undefined as any;
    this._isLoaded = true;
  }

  public toString(): string {
    return `${this.entity}.${this.fieldName}`;
  }

  private filterDeleted(entity: U | undefined, opts?: { withDeleted?: boolean }): U | undefined {
    return opts?.withDeleted === true || entity === undefined || !entity.isDeletedEntity ? entity : undefined;
  }

  /** Returns the other relation that points back at us, i.e. we're `Author.image` and this is `Image.author_id`. */
  private getOtherRelation(other: U): ManyToOneReference<U, T, any> {
    return (other as U)[this.otherFieldName] as any;
  }

  private getPreloaded(): U[] | undefined {
    if (this.entity.isNewEntity) return undefined;
    return getEmInternalApi(this.entity.em).getPreloadedRelation(this.entity.idTagged, this.fieldName);
  }

  [RelationT] = null!;
  [RelationU] = null!;
  [ReferenceN] = null!;
  [OneToOne] = null!;
}

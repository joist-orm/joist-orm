import { currentlyInstantiatingEntity, deTagIds, ensureNotDeleted, fail, IdOf, LoadedReference, setField } from "../";
import { oneToOneDataLoader } from "../dataloaders/oneToOneDataLoader";
import { Entity } from "../Entity";
import { EntityMetadata, getMetadata } from "../EntityMetadata";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { ManyToOneReference } from "./ManyToOneReference";
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
  idOrFail: IdOf<U>;

  idUntagged: string | undefined;

  idUntaggedOrFail: string;

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
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T & string,
  otherFieldName: keyof U & string,
  otherColumnName: string,
): OneToOneReference<T, U> {
  const entity = currentlyInstantiatingEntity as T;
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
  extends AbstractRelationImpl<U>
  implements OneToOneReference<T, U>
{
  private loaded: U | undefined;
  private _isLoaded: boolean = false;
  private isCascadeDelete: boolean;

  constructor(
    // These are public to our internal implementation but not exposed in the Collection API
    public entity: T,
    public otherMeta: EntityMetadata<U>,
    public fieldName: keyof T & string,
    public otherFieldName: keyof U & string,
    public otherColumnName: string,
  ) {
    super();
    this.isCascadeDelete = getMetadata(entity)?.config.__data.cascadeDeleteFields.includes(fieldName as any);
  }

  get id(): IdOf<U> | undefined {
    if (this._isLoaded) {
      return this.loaded?.id as IdOf<U> | undefined;
    }
    throw new Error(`${this.entity}.${this.fieldName} was not loaded`);
  }

  get idOrFail(): IdOf<U> {
    return this.id || fail(`${this.entity}.${this.fieldName} has no id yet`);
  }

  get idUntagged(): string | undefined {
    return this.id && deTagIds(this.otherMeta, [this.id])[0];
  }

  get idUntaggedOrFail(): string {
    return this.idUntagged || fail("Reference is unset or assigned to a new entity");
  }

  get isSet(): boolean {
    if (this._isLoaded) {
      return this.loaded !== undefined;
    }
    throw new Error(`${this.entity}.${this.fieldName} was not loaded`);
  }

  // opts is an internal parameter
  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<U | undefined> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (!this._isLoaded || opts.forceReload) {
      if (!this.entity.isNewEntity) {
        this.loaded = await oneToOneDataLoader(this.entity.em, this).load(this.entity.idTaggedOrFail);
      }
      this._isLoaded = true;
    }
    return this.filterDeleted(this.loaded, opts);
  }

  set(other: U, opts: { percolating?: boolean } = {}): void {
    ensureNotDeleted(this.entity, { ignore: "pending" });
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

  get getWithDeleted(): U | undefined {
    return this.filterDeleted(this.doGet(), { withDeleted: true });
  }

  get get(): U | undefined {
    return this.filterDeleted(this.doGet(), { withDeleted: false });
  }

  private doGet(): U | undefined {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (!this._isLoaded) {
      // This should only be callable in the type system if we've already resolved this to an instance
      throw new Error("get was called when not preloaded");
    }
    return this.loaded;
  }

  // internal impl

  setFromOpts(other: U): void {
    this.set(other);
  }

  initializeForNewEntity(): void {
    this._isLoaded = true;
  }

  maybeCascadeDelete(): void {
    if (this.isCascadeDelete && this.loaded) {
      this.entity.em.delete(this.loaded);
    }
  }

  async cleanupOnEntityDeleted(): Promise<void> {
    const current = await this.load({ withDeleted: true });
    if (current !== undefined) {
      this.getOtherRelation(current).set(undefined as any);
      setField(current, this.otherFieldName, undefined);
    }
    this.loaded = undefined as any;
    this._isLoaded = true;
  }

  public toString(): string {
    return `OneToOneReference(entity: ${this.entity}, fieldName: ${this.fieldName}, otherType: ${this.otherMeta.type}, otherFieldName: ${this.otherFieldName})`;
  }

  private filterDeleted(entity: U | undefined, opts?: { withDeleted?: boolean }): U | undefined {
    return opts?.withDeleted === true || entity === undefined || !entity.isDeletedEntity ? entity : undefined;
  }

  /** Returns the other relation that points back at us, i.e. we're `Author.image` and this is `Image.author_id`. */
  private getOtherRelation(other: U): ManyToOneReference<U, T, any> {
    return (other as U)[this.otherFieldName] as any;
  }

  [RelationT] = null!;
  [RelationU] = null!;
  [ReferenceN] = null!;
  [OneToOne] = null!;
}

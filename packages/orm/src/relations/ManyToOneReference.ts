import { Entity, EntityMetadata, getMetadata, IdOf, isEntity, ManyToOneField } from "../EntityManager";
import {
  deTagIds,
  ensureNotDeleted,
  fail,
  getEm,
  isLoadedReference,
  isManyToOneField,
  maybeResolveReferenceToId,
  OneToOneReference,
  Reference,
  setField,
} from "../index";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { OneToManyCollection } from "./OneToManyCollection";

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
export class ManyToOneReference<T extends Entity, U extends Entity, N extends never | undefined>
  extends AbstractRelationImpl<U>
  implements Reference<T, U, N>
{
  // Either the loaded entity, or N/undefined if we're allowed to be null
  private loaded!: U | N | undefined;
  // We need a separate boolean to b/c loaded == undefined can still mean "_isLoaded" for nullable fks.
  private _isLoaded = false;
  private isCascadeDelete: boolean;

  constructor(
    private entity: T,
    public otherMeta: EntityMetadata<U>,
    private fieldName: keyof T,
    public otherFieldName: keyof U,
  ) {
    super();
    this.isCascadeDelete = otherMeta.config.__data.cascadeDeleteFields.includes(fieldName as any);
  }

  async load(opts?: { withDeleted?: boolean }): Promise<U | N> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (this._isLoaded) {
      return this.loaded!;
    }
    const current = this.current();
    // Resolve the id to an entity
    if (!isEntity(current) && current !== undefined) {
      this.loaded = (await getEm(this.entity).load(this.otherMeta.cstr, current)) as any as U;
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

    this.loaded = id ? getEm(this.entity)["findExistingInstance"](id) : undefined;
    this._isLoaded = !!this.loaded;
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
    // Our codegen'd Opts type will ensure our field is inititalized if necessary/notNull
    this._isLoaded = true;
  }

  async refreshIfLoaded(): Promise<void> {
    // TODO We should remember what load hints have been applied to this collection and re-apply them.
    if (this._isLoaded) {
      const current = this.current();
      if (typeof current === "string") {
        this.loaded = (await getEm(this.entity).load(this.otherMeta.cstr, current)) as any as U;
      } else {
        this.loaded = current;
      }
    }
  }

  maybeCascadeDelete(): void {
    if (this.isCascadeDelete) {
      const current = this.current({ withDeleted: true });
      if (current !== undefined && typeof current !== "string") {
        getEm(this.entity).delete(current as U);
      }
    }
  }

  async cleanupOnEntityDeleted(): Promise<void> {
    const current = await this.load({ withDeleted: true });
    if (current !== undefined) {
      const o2m = this.getOtherRelation(current);
      if (o2m instanceof OneToManyCollection) {
        o2m.remove(this.entity, { requireLoaded: false });
      } else {
        o2m.set(undefined as any);
      }
    }
    setField(this.entity, this.fieldName, undefined);
    this.loaded = undefined as any;
    this._isLoaded = true;
  }

  // Internal method used by OneToManyCollection
  setImpl(other: U | N): void {
    // If other is new (i.e. has no id), we only noop/early exit if it matches our loaded reference.
    // Otherwise, noop/early exit based on id comparison (b/c we may not be loaded yet).
    if (other?.isNewEntity ? other === this.loaded : this.id === other?.id) {
      return;
    }

    ensureNotDeleted(this.entity, { ignore: "pending" });
    const previous = this.maybeFindEntity();

    // Prefer to keep the id in our data hash, but if this is a new entity w/o an id, use the entity itself
    setField(this.entity, this.fieldName, other?.id ?? other);

    this.loaded = other;
    this._isLoaded = true;
    this.maybeRemove(previous);
    this.maybeAdd(other);

    // Is our entity in an aggregate root? If so, is our current field
    const meta = getMetadata(this.entity);
    const field = meta.fields.find((f) => f.fieldName === this.fieldName)! as ManyToOneField;
    // If this is BookReview.book.set, try and set BookReview.rootAuthor.set(book.author.get)
    // 1. Find the `BookReview.author` m2o
    if (field.aggregateRootTo) {
      for (const to of field.aggregateRootTo) {
        // I.e. for `BookReview.book`, `toField` will be `BookReview.rootAuthor`
        const toField = meta.fields.find((f) => f.fieldName === to)! as ManyToOneField;
        // Find the root (i.e. author) from the currently-being-set value (i.e. book)
        const root = this.otherMeta.fields
          .filter(isManyToOneField)
          // Find the book's `author` field(s)
          .filter((m2o) => m2o.otherMetadata() === toField.otherMetadata())
          .map((m2o) => (other as any)[m2o.fieldName])
          .map((ref) => (isLoadedReference(ref) ? ref.get : ref.id))
          .filter((v) => v !== undefined)[0];
        if (root) {
          if (typeof root === "string") {
            (this.entity as any)[to].id = root;
          } else {
            (this.entity as any)[to].set(root);
          }
        }
      }
    }
  }

  maybeRemove(other: U | undefined) {
    if (other) {
      const prevRelation = this.getOtherRelation(other);
      if (prevRelation instanceof OneToManyCollection) {
        prevRelation.removeIfLoaded(this.entity);
      } else {
        prevRelation.set(undefined as any);
      }
    }
  }

  maybeAdd(other: U | undefined) {
    if (other) {
      const newRelation = this.getOtherRelation(other);
      if (newRelation instanceof OneToManyCollection) {
        newRelation.add(this.entity);
      } else {
        newRelation.set(this.entity);
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
  private getOtherRelation(other: U): OneToManyCollection<U, T> | OneToOneReference<U, T> {
    return (other as U)[this.otherFieldName] as any;
  }

  /**
   * Looks for an entity in `EntityManager`, b/c we may have it in memory even if
   * our reference is not specifically loaded.
   */
  maybeFindEntity(): U | undefined {
    // Check this.loaded first b/c a new entity won't have an id yet
    return this.loaded ?? (this.id !== undefined ? getEm(this.entity)["findExistingInstance"](this.id) : undefined);
  }
}

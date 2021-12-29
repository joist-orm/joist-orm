import { Entity, getMetadata, IdOf, isEntity, PolymorphicFieldComponent } from "../EntityManager";
import {
  deTagId,
  ensureNotDeleted,
  fail,
  getConstructorFromTaggedId,
  getEm,
  maybeGetConstructorFromReference,
  maybeResolveReferenceToId,
  OneToOneReference,
  PolymorphicField,
  Reference,
  setField,
} from "../index";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { OneToManyCollection } from "./OneToManyCollection";
import { ReferenceN } from "./Reference";
import { RelationT, RelationU } from "./Relation";

/** Type guard utility for determining if an entity field is a PolymorphicReference. */
export function isPolymorphicReference(maybeReference: any): maybeReference is PolymorphicReference<any, any, any> {
  return maybeReference instanceof PolymorphicReferenceImpl;
}

export interface PolymorphicReference<T extends Entity, U extends Entity, N extends never | undefined>
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
 * Manages a set of foreign keys from one entity to another, i.e. `Comment.parent --> Book | BookReview`.
 *
 * We keep the current `parent` / `parent.id` value in the `__orm.data` hash, where the
 * current value could be either the `comments.parent_book_id` / `comments.parent_book_review_id` id (as a tagged string)
 * from the database, or an entity `Book` / `BookReview` that the user has set.
 *
 * Note that if any of our columns (eg `comments.parent_book_review_id`) is unique, this `PolymorphicReference` will
 * essentially be half of a one-to-one relationship, but we'll keep using this reference on the "owning" side; the other
 * side, i.e. `BookReview.comment` will use a `OneToOneReference` to point back to us.
 */
export class PolymorphicReferenceImpl<T extends Entity, U extends Entity, N extends never | undefined>
  extends AbstractRelationImpl<U>
  implements PolymorphicReference<T, U, N>
{
  private loaded!: U | N;
  // We need a separate boolean to b/c loaded == undefined can still mean "_isLoaded" for nullable fks.
  private _isLoaded = false;
  private field: PolymorphicField;

  constructor(private entity: T, private fieldName: keyof T) {
    super();
    this.field = getMetadata(entity).fields.find((f) => f.fieldName === this.fieldName) as PolymorphicField;
  }

  private get currentComponent(): PolymorphicFieldComponent | N {
    const cstr = maybeGetConstructorFromReference(this.current());
    return this.field.components.find((c) => c.otherMetadata().cstr === cstr) as any;
  }

  private get isCascadeDelete(): boolean {
    return (
      this.currentComponent?.otherMetadata().config.__data.cascadeDeleteFields.includes(this.fieldName as any) ?? false
    );
  }

  async load(opts?: { withDeleted?: boolean }): Promise<U | N> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    const current = this.current();
    // Resolve the id to an entity
    if (!isEntity(current) && current !== undefined) {
      this.loaded = (await getEm(this.entity).load(getConstructorFromTaggedId(current), current)) as any as U;
    }
    this._isLoaded = true;
    return this.filterDeleted(this.loaded, opts);
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
      const existing = this.maybeFindExisting();
      if (existing === undefined) {
        throw new Error(`${this.entity}.${this.fieldName} was not loaded`);
      }
      this.loaded = existing;
      this._isLoaded = true;
    }

    return this.filterDeleted(this.loaded, opts);
  }

  get getWithDeleted(): U | N {
    return this.doGet({ withDeleted: true });
  }

  get get(): U | N {
    return this.doGet({ withDeleted: false });
  }

  get id(): IdOf<U> | undefined {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    return maybeResolveReferenceToId(this.current()) as IdOf<U> | undefined;
  }

  get idOrFail(): IdOf<U> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    return this.id || fail("Reference is unset or assigned to a new entity");
  }

  get idUntagged(): string | undefined {
    return this.id && deTagId(getMetadata(getConstructorFromTaggedId(this.id)), this.id);
  }

  get idUntaggedOrFail(): string {
    return this.idUntagged || fail("Reference is unset or assigned to a new entity");
  }

  // private impl

  setFromOpts(other: U): void {
    this.setImpl(other);
  }

  initializeForNewEntity(): void {
    // Our codegened Opts type will ensure our field is initialized if necessary/notNull
    this._isLoaded = true;
  }

  async refreshIfLoaded(): Promise<void> {
    // TODO We should remember what load hints have been applied to this collection and re-apply them.
    if (this._isLoaded) {
      const current = this.current();
      if (typeof current === "string") {
        this.loaded = (await getEm(this.entity).load(getConstructorFromTaggedId(current), current)) as any as U;
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

  // Internal method used by PolymorphicReference
  setImpl(other: U | N): void {
    if (other?.isNewEntity ? other === this.loaded : this.id === other?.id) {
      return;
    }

    if (other !== undefined && !this.field.components.some((c) => other instanceof c.otherMetadata().cstr)) {
      fail(`${other} cannot be set as '${this.field.fieldName}' on ${this.entity}`);
    }

    // we may not be loaded yet, but our previous entity might already be in the UoW
    const previousLoaded = this.loaded ?? this.maybeFindExisting();

    ensureNotDeleted(this.entity, { ignore: "pending" });

    // Prefer to keep the id in our data hash, but if this is a new entity w/o an id, use the entity itself
    const changed = setField(this.entity, this.fieldName, other?.id ?? other);
    if (!changed) {
      return;
    }
    this.loaded = other;
    this._isLoaded = true;

    // If had an existing value, remove us from its collection
    if (previousLoaded) {
      const prevRelation = this.getOtherRelation(previousLoaded);
      if (prevRelation instanceof OneToManyCollection) {
        prevRelation.removeIfLoaded(this.entity);
      } else {
        prevRelation.set(undefined as any);
      }
    }
    if (other !== undefined) {
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
    const current = this.entity.__orm.data[this.fieldName ?? ""];
    if (current !== undefined && isEntity(current)) {
      return this.filterDeleted(current as U, opts);
    }
    return current;
  }

  public toString(): string {
    return `PolymorphicReference(entity: ${this.entity}, fieldName: ${this.fieldName}, otherType: ${
      this.currentComponent?.otherMetadata().type
    }, otherFieldName: ${this.currentComponent?.otherFieldName}, id: ${this.id})`;
  }

  private filterDeleted(entity: U | N, opts?: { withDeleted?: boolean }): U | N {
    return opts?.withDeleted === true || entity === undefined || !entity.isDeletedEntity ? entity : (undefined as N);
  }

  /** Returns the other relation that points back at us, i.e. we're `comment.parent_book_id` and this is `Book.comments`. */
  private getOtherRelation(other: U): OneToManyCollection<U, T> | OneToOneReference<U, T> {
    const component = this.field.components.find((c) => c.otherMetadata().cstr === other.constructor) as any;
    return (other as U)[component?.otherFieldName as keyof U] as any;
  }

  private maybeFindExisting(): U | undefined {
    return this.id !== undefined ? getEm(this.entity)["findExistingInstance"](this.id) : undefined;
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
  [ReferenceN]: N = null!;
}

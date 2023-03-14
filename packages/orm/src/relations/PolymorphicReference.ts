import { Entity, isEntity } from "../Entity";
import { currentlyInstantiatingEntity, IdOf, sameEntity } from "../EntityManager";
import { getMetadata, PolymorphicFieldComponent } from "../EntityMetadata";
import {
  deTagId,
  ensureNotDeleted,
  fail,
  getConstructorFromTaggedId,
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
import { RelationU } from "./Relation";

export function hasOnePolymorphic<T extends Entity, U extends Entity, N extends never | undefined>(
  fieldName: keyof T & string,
): PolymorphicReference<T, U, N> {
  const entity = currentlyInstantiatingEntity as T;
  return new PolymorphicReferenceImpl<T, U, N>(entity, fieldName);
}

/** Type guard utility for determining if an entity field is a PolymorphicReference. */
export function isPolymorphicReference(maybeReference: any): maybeReference is PolymorphicReference<any, any, any> {
  return maybeReference instanceof PolymorphicReferenceImpl;
}

export interface PolymorphicReference<T extends Entity, U extends Entity, N extends never | undefined>
  extends Reference<U, N> {
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
  private loaded: U | N | undefined;
  // We need a separate boolean to b/c loaded == undefined can still mean "_isLoaded" for nullable fks.
  private _isLoaded = false;
  private field: PolymorphicField;

  constructor(private entity: T, private fieldName: keyof T & string) {
    super();
    this.field = getMetadata(entity).fields[this.fieldName] as PolymorphicField;
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

  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<U | N> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    const current = this.current();
    // Resolve the id to an entity
    if (!isEntity(current) && current !== undefined && (!this._isLoaded || opts.forceReload)) {
      this.loaded = (await this.entity.em.load(getConstructorFromTaggedId(current), current)) as any as U;
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
      const existing = this.maybeFindExisting();
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
    // Usually our codegened opts ensures that polys are only initialized with entities,
    // but em.clone currently passes in strings
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
      } else {
        o2m.set(undefined as any);
      }
    }
    setField(this.entity, this.fieldName, undefined);
    this.loaded = undefined as any;
    this._isLoaded = true;
  }

  // Internal method used by PolymorphicReference
  setImpl(other: U | IdOf<U> | N): void {
    if (sameEntity(other, this.current({ withDeleted: true }))) {
      return;
    }

    if (
      other !== undefined &&
      !this.field.components.some(
        (c) =>
          other instanceof c.otherMetadata().cstr ||
          (typeof other === "string" && getConstructorFromTaggedId(other) === c.otherMetadata().cstr),
      )
    ) {
      fail(`${other} cannot be set as '${this.field.fieldName}' on ${this.entity}`);
    }

    // we may not be loaded yet, but our previous entity might already be in the UoW
    const previousLoaded = this.loaded ?? this.maybeFindExisting();

    ensureNotDeleted(this.entity, { ignore: "pending" });

    // Prefer to keep the id in our data hash, but if this is a new entity w/o an id, use the entity itself
    const changed = setField(this.entity, this.fieldName, isEntity(other) ? other?.id ?? other : other);

    if (typeof other === "string") {
      this.loaded = undefined;
      this._isLoaded = false;
    } else {
      this.loaded = other;
      this._isLoaded = true;
    }

    // If had an existing value, remove us from its collection
    if (previousLoaded) {
      const prevRelation = this.getOtherRelation(previousLoaded);
      if (prevRelation instanceof OneToManyCollection) {
        prevRelation.removeIfLoaded(this.entity);
      } else {
        prevRelation.set(undefined as any);
      }
    }
    if (other !== undefined && isEntity(other)) {
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
    const component = this.field.components.find((c) => other instanceof c.otherMetadata().cstr) as any;
    return (other as U)[component?.otherFieldName as keyof U] as any;
  }

  private maybeFindExisting(): U | undefined {
    return this.id !== undefined ? this.entity.em.getEntity(this.id) : undefined;
  }

  [RelationU]: U = null!;
  [ReferenceN]: N = null!;
}

import { oneToManyDataLoader } from "../dataloaders/oneToManyDataLoader";
import { oneToManyFindDataLoader } from "../dataloaders/oneToManyFindDataLoader";
import {
  Collection,
  currentlyInstantiatingEntity,
  ensureNotDeleted,
  Entity,
  EntityMetadata,
  getEmInternalApi,
  getMetadata,
  IdOf,
  maybeResolveReferenceToId,
  OneToManyField,
  OrderBy,
  sameEntity,
} from "../index";
import { compareValues, remove } from "../utils";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { ManyToOneReferenceImpl } from "./ManyToOneReference";
import { RelationT, RelationU } from "./Relation";

/** An alias for creating `OneToManyCollection`s. */
export function hasMany<T extends Entity, U extends Entity>(
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T & string,
  otherFieldName: keyof U & string,
  otherColumnName: string,
  orderBy: { field: keyof U; direction: OrderBy } | undefined,
): Collection<T, U> {
  const entity = currentlyInstantiatingEntity as T;
  return new OneToManyCollection(entity, otherMeta, fieldName, otherFieldName, otherColumnName, orderBy);
}

export class OneToManyCollection<T extends Entity, U extends Entity>
  extends AbstractRelationImpl<U[]>
  implements Collection<T, U>
{
  readonly #entity: T;
  readonly #fieldName: keyof T & string;
  readonly #orderBy: { field: keyof U; direction: OrderBy } | undefined;
  private loaded: U[] | undefined;
  // We don't need to track removedBeforeLoaded, because if a child is removed in our unloaded state,
  // when we load and get back the `child X has parent_id = our id` rows from the db, `loaderForCollection`
  // groups the hydrated rows by their _current parent m2o field value_, which for a removed child will no
  // longer be us, so it will effectively not show up in our post-load `loaded` array.
  #addedBeforeLoaded: U[] | undefined;

  constructor(
    // These are public to our internal implementation but not exposed in the Collection API
    entity: T,
    otherMeta: EntityMetadata<U>,
    public fieldName: keyof T & string,
    public otherFieldName: keyof U & string,
    public otherColumnName: string,
    orderBy: { field: keyof U; direction: OrderBy } | undefined,
  ) {
    super();
    this.#entity = entity;
    this.#fieldName = fieldName;
    this.#orderBy = orderBy;
  }

  // opts is an internal parameter
  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<readonly U[]> {
    ensureNotDeleted(this.#entity, "pending");
    if (this.loaded === undefined || (opts.forceReload && !this.#entity.isNewEntity)) {
      this.loaded = await oneToManyDataLoader(this.#entity.em, this).load(this.#entity.idTagged!);
      this.maybeAppendAddedBeforeLoaded();
    }
    return this.filterDeleted(this.loaded, opts);
  }

  async find(id: IdOf<U>): Promise<U | undefined> {
    ensureNotDeleted(this.#entity, "pending");
    if (this.loaded !== undefined) {
      return this.loaded.find((other) => other.id === id);
    } else {
      const added = this.#addedBeforeLoaded?.find((u) => u.id === id);
      if (added) {
        return added;
      }
      // Make a cacheable tuple to look up this specific o2m row
      const key = `id=${id},${this.otherColumnName}=${this.#entity.id}`;
      return oneToManyFindDataLoader(this.#entity.em, this).load(key);
    }
  }

  async includes(other: U): Promise<boolean> {
    return sameEntity(this.#entity, this.getOtherRelation(other).current());
  }

  get isLoaded(): boolean {
    return this.loaded !== undefined;
  }

  get get(): U[] {
    return this.filterDeleted(this.doGet(), { withDeleted: false });
  }

  get getWithDeleted(): U[] {
    return this.filterDeleted(this.doGet(), { withDeleted: true });
  }

  private doGet(): U[] {
    ensureNotDeleted(this.#entity, "pending");
    if (this.loaded === undefined) {
      // This should only be callable in the type system if we've already resolved this to an instance
      throw new Error("get was called when not preloaded");
    }
    return this.loaded;
  }

  set(values: U[]): void {
    ensureNotDeleted(this.#entity);
    if (this.loaded === undefined) {
      throw new Error("set was called when not loaded");
    }

    // If we're changing `a1.books = [b1, b2]` to `a1.books = [b2]`, then implicitly delete the old book
    const otherCannotChange = this.otherMeta.fields[this.otherFieldName].immutable;
    if (this.isCascadeDelete && otherCannotChange) {
      const implicitlyDeleted = this.loaded.filter((e) => !values.includes(e));
      implicitlyDeleted.forEach((e) => this.#entity.em.delete(e));
      // Keep the implicitlyDeleted values for `getWithDeleted` to return
      values.push(...implicitlyDeleted);
    }

    // Make a copy for safe iteration
    const loaded = [...this.loaded];
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
    ensureNotDeleted(this.#entity);
    if (this.loaded === undefined) {
      if (!this.#addedBeforeLoaded?.includes(other)) {
        (this.#addedBeforeLoaded ??= []).push(other);
      }
    } else {
      if (!this.loaded.includes(other)) {
        this.loaded.push(other);
      }
    }
    // This will no-op and mark other dirty if necessary
    this.getOtherRelation(other).set(this.#entity);
  }

  // We're not supported remove(other) because that might leave other.otherFieldName as undefined,
  // which we don't know if that's valid or not, i.e. depending on whether the field is nullable.
  remove(other: U, opts: { requireLoaded: boolean } = { requireLoaded: true }) {
    ensureNotDeleted(this.#entity, "pending");
    if (this.loaded === undefined && opts.requireLoaded) {
      throw new Error("remove was called when not loaded");
    }
    remove(this.loaded ?? this.#addedBeforeLoaded ?? [], other);
    // This will no-op and mark other dirty if necessary
    this.getOtherRelation(other).set(undefined);
  }

  removeAll(): void {
    ensureNotDeleted(this.#entity);
    if (this.loaded === undefined) {
      throw new Error("removeAll was called when not loaded");
    }
    for (const other of [...this.loaded]) {
      this.remove(other);
    }
  }

  // internal impl

  setFromOpts(others: U[]): void {
    this.loaded = [];
    others.forEach((o) => this.add(o));
  }

  initializeForNewEntity(): void {
    // Don't overwrite any opts values
    if (this.loaded === undefined) {
      this.loaded = [];
    }
  }

  removeIfLoaded(other: U) {
    if (this.loaded !== undefined) {
      remove(this.loaded, other);
    } else if (this.#addedBeforeLoaded) {
      remove(this.#addedBeforeLoaded, other);
    }
  }

  maybeCascadeDelete(): void {
    if (this.isCascadeDelete) {
      this.current({ withDeleted: true }).forEach((e) => this.#entity.em.delete(e));
    }
  }

  // We already unhooked all children in our addedBeforeLoaded list; now load the full list if necessary.
  async cleanupOnEntityDeleted(): Promise<void> {
    // if we are going to delete this relation as well, then we don't need to clean it up
    if (this.isCascadeDelete) return;
    const current = await this.load({ withDeleted: true });
    current.forEach((other) => {
      const m2o = this.getOtherRelation(other);
      if (maybeResolveReferenceToId(m2o.current({ withDeleted: true })) === this.#entity.idMaybe) {
        // TODO What if other.otherFieldName is required/not-null?
        m2o.set(undefined);
      }
    });
    this.loaded = [];
    this.#addedBeforeLoaded = [];
  }

  private maybeAppendAddedBeforeLoaded(): void {
    // If our entity is not new, then entities in the EM might have been mutated to point
    // to our foreign key (instead of our loaded instance), which means they should be in
    // `addedBeforeLoaded` but are not.
    //
    // (Note that we don't have to handle the case for "removed before loaded" here because
    // the oneToManyDataLoader already handles that; although maybe arguably that logic should
    // be handled here?)
    if (!this.#entity.isNewEntity) {
      const { em } = this.#entity;
      const newChildren = getEmInternalApi(em).pendingChildren.get(this.#entity.idTagged!)?.get(this.fieldName);
      if (newChildren) {
        (this.#addedBeforeLoaded ??= []).push(...(newChildren as U[]));
        newChildren.splice(0, newChildren.length);
      }
    }
    if (this.#addedBeforeLoaded) {
      const newEntities = this.#addedBeforeLoaded.filter((e) => !this.loaded?.includes(e));
      // Push on the end to better match the db order of "newer things come last"
      this.loaded!.push(...newEntities);
    }
    this.#addedBeforeLoaded = [];
  }

  current(opts?: { withDeleted?: boolean }): U[] {
    return this.filterDeleted(this.loaded ?? this.#addedBeforeLoaded ?? [], opts);
  }

  public get meta(): EntityMetadata<T> {
    return getMetadata(this.#entity);
  }

  public get entity(): T {
    return this.#entity;
  }

  public get otherMeta(): EntityMetadata<U> {
    return (getMetadata(this.#entity).allFields[this.#fieldName] as OneToManyField).otherMetadata();
  }

  public toString(): string {
    return `OneToManyCollection(entity: ${this.#entity}, fieldName: ${this.fieldName}, otherType: ${
      this.otherMeta.type
    }, otherFieldName: ${this.otherFieldName})`;
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
    return getMetadata(this.#entity).config.__data.cascadeDeleteFields.includes(this.#fieldName as any);
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}

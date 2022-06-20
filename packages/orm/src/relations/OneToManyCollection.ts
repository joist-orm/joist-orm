import { oneToManyDataLoader } from "../dataloaders/oneToManyDataLoader";
import { oneToManyFindDataLoader } from "../dataloaders/oneToManyFindDataLoader";
import {
  Collection,
  currentlyInstantiatingEntity,
  ensureNotDeleted,
  Entity,
  EntityMetadata,
  getMetadata,
  IdOf,
  maybeResolveReferenceToId,
  sameEntity,
} from "../index";
import { remove } from "../utils";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { ManyToOneReferenceImpl } from "./ManyToOneReference";
import { RelationT, RelationU } from "./Relation";

/** An alias for creating `OneToManyCollection`s. */
export function hasMany<T extends Entity, U extends Entity>(
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T & string,
  otherFieldName: keyof U & string,
  otherColumnName: string,
): Collection<T, U> {
  const entity = currentlyInstantiatingEntity as T;
  return new OneToManyCollection(entity, otherMeta, fieldName, otherFieldName, otherColumnName);
}

export class OneToManyCollection<T extends Entity, U extends Entity>
  extends AbstractRelationImpl<U[]>
  implements Collection<T, U>
{
  private loaded: U[] | undefined;
  // We don't need to track removedBeforeLoaded, because if a child is removed in our unloaded state,
  // when we load and get back the `child X has parent_id = our id` rows from the db, `loaderForCollection`
  // groups the hydrated rows by their _current parent m2o field value_, which for a removed child will no
  // longer be us, so it will effectively not show up in our post-load `loaded` array.
  private addedBeforeLoaded: U[] = [];
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

  // opts is an internal parameter
  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<readonly U[]> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (this.loaded === undefined || opts.forceReload) {
      if (this.entity.idTagged === undefined) {
        this.loaded = [];
      } else {
        this.loaded = await oneToManyDataLoader(this.entity.em, this).load(this.entity.idTagged);
      }
      this.maybeAppendAddedBeforeLoaded();
    }
    return this.filterDeleted(this.loaded, opts);
  }

  async find(id: IdOf<U>): Promise<U | undefined> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (this.loaded !== undefined) {
      return this.loaded.find((other) => other.id === id);
    } else {
      const added = this.addedBeforeLoaded.find((u) => u.id === id);
      if (added) {
        return added;
      }
      // Make a cacheable tuple to look up this specific o2m row
      const key = `id=${id},${this.otherColumnName}=${this.entity.idOrFail}`;
      return oneToManyFindDataLoader(this.entity.em, this).load(key);
    }
  }

  async includes(other: U): Promise<boolean> {
    return sameEntity(this.entity, this.meta, this.getOtherRelation(other).current());
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
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (this.loaded === undefined) {
      if (this.entity.id === undefined) {
        return this.addedBeforeLoaded;
      } else {
        // This should only be callable in the type system if we've already resolved this to an instance
        throw new Error("get was called when not preloaded");
      }
    }
    return this.loaded;
  }

  set(values: U[]): void {
    ensureNotDeleted(this.entity);
    if (this.loaded === undefined) {
      throw new Error("set was called when not loaded");
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
    ensureNotDeleted(this.entity);
    if (this.loaded === undefined) {
      if (!this.addedBeforeLoaded.includes(other)) {
        this.addedBeforeLoaded.push(other);
      }
    } else {
      if (!this.loaded.includes(other)) {
        this.loaded.push(other);
      }
    }
    // This will no-op and mark other dirty if necessary
    this.getOtherRelation(other).set(this.entity);
  }

  // We're not supported remove(other) because that might leave other.otherFieldName as undefined,
  // which we don't know if that's valid or not, i.e. depending on whether the field is nullable.
  remove(other: U, opts: { requireLoaded: boolean } = { requireLoaded: true }) {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (this.loaded === undefined && opts.requireLoaded) {
      throw new Error("remove was called when not loaded");
    }
    remove(this.loaded || this.addedBeforeLoaded, other);
    // This will no-op and mark other dirty if necessary
    this.getOtherRelation(other).set(undefined);
  }

  removeAll(): void {
    ensureNotDeleted(this.entity);
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
    } else {
      remove(this.addedBeforeLoaded, other);
    }
  }

  maybeCascadeDelete(): void {
    if (this.isCascadeDelete) {
      this.current({ withDeleted: true }).forEach((e) => this.entity.em.delete(e));
    }
  }

  // We already unhooked all children in our addedBeforeLoaded list; now load the full list if necessary.
  async cleanupOnEntityDeleted(): Promise<void> {
    const current = await this.load({ withDeleted: true });
    current.forEach((other) => {
      const m2o = this.getOtherRelation(other);
      if (maybeResolveReferenceToId(m2o.current()) === this.entity.id) {
        // TODO What if other.otherFieldName is required/not-null?
        m2o.set(undefined);
      }
    });
    this.loaded = [];
    this.addedBeforeLoaded = [];
  }

  private maybeAppendAddedBeforeLoaded(): void {
    if (this.loaded) {
      const newEntities = this.addedBeforeLoaded.filter((e) => !this.loaded?.includes(e));
      // Push on the end to better match the db order of "newer things come last"
      for (const e of newEntities) {
        this.loaded.push(e);
      }
      this.addedBeforeLoaded = [];
    }
  }

  current(opts?: { withDeleted?: boolean }): U[] {
    return this.filterDeleted(this.loaded || this.addedBeforeLoaded, opts);
  }

  public get meta(): EntityMetadata<T> {
    return getMetadata(this.entity);
  }

  public toString(): string {
    return `OneToManyCollection(entity: ${this.entity}, fieldName: ${this.fieldName}, otherType: ${this.otherMeta.type}, otherFieldName: ${this.otherFieldName})`;
  }

  private filterDeleted(entities: U[], opts?: { withDeleted?: boolean }): U[] {
    return opts?.withDeleted === true ? [...entities] : entities.filter((e) => !e.isDeletedEntity);
  }

  /** Returns the other relation that points back at us, i.e. we're `Author.image` and this is `Image.author_id`. */
  private getOtherRelation(other: U): ManyToOneReferenceImpl<U, T, any> {
    return (other as U)[this.otherFieldName] as any;
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}

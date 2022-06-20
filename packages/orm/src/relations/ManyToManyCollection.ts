import {
  Collection,
  currentlyInstantiatingEntity,
  ensureNotDeleted,
  Entity,
  EntityMetadata,
  getMetadata,
  IdOf,
} from "../";
import { manyToManyDataLoader } from "../dataloaders/manyToManyDataLoader";
import { manyToManyFindDataLoader } from "../dataloaders/manyToManyFindDataLoader";
import { getOrSet, remove } from "../utils";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { RelationT, RelationU } from "./Relation";

/** An alias for creating `ManyToManyCollections`s. */
export function hasManyToMany<T extends Entity, U extends Entity>(
  joinTableName: string,
  fieldName: keyof T & string,
  columnName: string,
  otherMeta: EntityMetadata<U>,
  otherFieldName: keyof U & string,
  otherColumnName: string,
): Collection<T, U> {
  const entity = currentlyInstantiatingEntity as T;
  return new ManyToManyCollection<T, U>(
    joinTableName,
    entity,
    fieldName,
    columnName,
    otherMeta,
    otherFieldName,
    otherColumnName,
  );
}

export class ManyToManyCollection<T extends Entity, U extends Entity>
  extends AbstractRelationImpl<U[]>
  implements Collection<T, U>
{
  private loaded: U[] | undefined;
  private addedBeforeLoaded: U[] = [];
  private removedBeforeLoaded: U[] = [];
  private isCascadeDelete: boolean;

  constructor(
    public joinTableName: string,
    // I.e. when entity = Book:
    // fieldName == tags, because it's our collection to tags
    // columnName = book_id, what we use as the `where book_id = us` to find our join table rows
    // otherFieldName = books, how tags points to us
    // otherColumnName = tag_id, how the other side finds its join table rows
    public entity: T,
    public fieldName: keyof T & string,
    public columnName: string,
    public otherMeta: EntityMetadata<U>,
    public otherFieldName: keyof U & string,
    public otherColumnName: string,
  ) {
    super();
    this.isCascadeDelete = otherMeta?.config.__data.cascadeDeleteFields.includes(fieldName as any);
  }

  private filterDeleted(entities: U[], opts?: { withDeleted?: boolean }): U[] {
    return opts?.withDeleted === true ? [...entities] : entities.filter((e) => !e.isDeletedEntity);
  }

  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<ReadonlyArray<U>> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (this.loaded === undefined || opts.forceReload) {
      const key = `${this.columnName}=${this.entity.id}`;
      this.loaded = await manyToManyDataLoader(this.entity.em, this).load(key);
      this.maybeApplyAddedAndRemovedBeforeLoaded();
    }
    return this.filterDeleted(this.loaded!, opts) as ReadonlyArray<U>;
  }

  async find(id: IdOf<U>): Promise<U | undefined> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (this.loaded !== undefined) {
      return this.loaded.find((u) => u.id === id);
    } else {
      const added = this.addedBeforeLoaded.find((u) => u.id === id);
      if (added) {
        return added;
      }
      // Make a cacheable tuple to look up this specific m2m row
      const key = `${this.columnName}=${this.entity.id},${this.otherColumnName}=${id}`;
      const includes = await manyToManyFindDataLoader(this.entity.em, this).load(key);
      return includes ? this.entity.em.load(id) : undefined;
    }
  }

  async includes(other: U): Promise<boolean> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (this.loaded !== undefined) {
      return this.loaded.includes(other);
    } else {
      if (this.addedBeforeLoaded.includes(other)) {
        return true;
      } else if (other.isNewEntity) {
        return false;
      }
      // Make a cacheable tuple to look up this specific m2m row
      const key = `${this.columnName}=${this.entity.idOrFail},${this.otherColumnName}=${other.idOrFail}`;
      return manyToManyFindDataLoader(this.entity.em, this).load(key);
    }
  }

  add(other: U, percolated = false): void {
    ensureNotDeleted(this.entity);

    if (this.loaded !== undefined) {
      if (this.loaded.includes(other)) {
        return;
      }
      this.loaded.push(other);
    } else {
      remove(this.removedBeforeLoaded, other);
      if (!this.addedBeforeLoaded.includes(other)) {
        this.addedBeforeLoaded.push(other);
      }
    }

    if (!percolated) {
      const joinRow: JoinRow = {
        id: undefined,
        m2m: this,
        [this.columnName]: this.entity,
        [this.otherColumnName]: other,
      };
      getOrSet(this.entity.em.__data.joinRows, this.joinTableName, []).push(joinRow);
      (other[this.otherFieldName] as any as ManyToManyCollection<U, T>).add(this.entity, true);
    }
  }

  remove(other: U, percolated = false): void {
    ensureNotDeleted(this.entity, { ignore: "pending" });

    if (!percolated) {
      const joinRows = getOrSet(this.entity.em.__data.joinRows, this.joinTableName, []);
      const row = joinRows.find((r) => r[this.columnName] === this.entity && r[this.otherColumnName] === other);
      if (row) {
        row.deleted = true;
      } else {
        const joinRow: JoinRow = {
          // Use -1 to force the sortJoinRows to notice us as dirty ("delete: true but id is set")
          id: -1,
          m2m: this,
          [this.columnName]: this.entity,
          [this.otherColumnName]: other,
          deleted: true,
        };
        getOrSet(this.entity.em.__data.joinRows, this.joinTableName, []).push(joinRow);
      }
      (other[this.otherFieldName] as any as ManyToManyCollection<U, T>).remove(this.entity, true);
    }

    if (this.loaded !== undefined) {
      remove(this.loaded, other);
    } else {
      remove(this.addedBeforeLoaded, other);
      if (!this.removedBeforeLoaded.includes(other)) {
        this.removedBeforeLoaded.push(other);
      }
    }
  }

  get isLoaded(): boolean {
    return this.loaded !== undefined;
  }

  private doGet(): U[] {
    ensureNotDeleted(this.entity);
    if (this.loaded === undefined) {
      if (this.entity.id === undefined) {
        return this.addedBeforeLoaded;
      } else {
        // This should only be callable in the type system if we've already resolved this to an instance
        throw new Error("get was called when not loaded");
      }
    }
    return this.loaded;
  }

  get getWithDeleted(): U[] {
    return this.filterDeleted(this.doGet(), { withDeleted: true });
  }

  get get(): U[] {
    return this.filterDeleted(this.doGet(), { withDeleted: false });
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

  removeAll(): void {
    ensureNotDeleted(this.entity);
    if (this.loaded === undefined) {
      throw new Error("removeAll was called when not loaded");
    }
    for (const other of [...this.loaded]) {
      this.remove(other);
    }
  }

  // impl details

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

  maybeCascadeDelete() {
    if (this.isCascadeDelete) {
      this.current({ withDeleted: true }).forEach((e) => this.entity.em.delete(e));
    }
  }

  async cleanupOnEntityDeleted(): Promise<void> {
    const entities = await this.load({ withDeleted: true });
    entities.forEach((other) => {
      const m2m = other[this.otherFieldName] as any as ManyToManyCollection<U, T>;
      m2m.remove(this.entity);
    });
    this.loaded = [];
  }

  private maybeApplyAddedAndRemovedBeforeLoaded(): void {
    if (this.loaded) {
      // this.loaded.unshift(...this.addedBeforeLoaded);
      // this.addedBeforeLoaded = [];
      this.removedBeforeLoaded.forEach((e) => {
        remove(this.loaded!, e);
        const { em } = this.entity;
        const row = em.__data.joinRows[this.joinTableName].find(
          (r) => r[this.columnName] === this.entity && r[this.otherColumnName] === e,
        );
        if (row) {
          row.deleted = true;
        }
      });
      this.removedBeforeLoaded = [];
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

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}

export type JoinRow = {
  id: number | undefined;
  m2m: ManyToManyCollection<any, any>;
  created_at?: Date;
  [column: string]: number | Entity | undefined | boolean | Date | ManyToManyCollection<any, any>;
  deleted?: boolean;
};

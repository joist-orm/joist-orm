import { Collection, ensureNotDeleted, Entity, EntityMetadata, getEm, getMetadata, IdOf } from "../";
import { manyToManyDataLoader } from "../dataloaders/manyToManyDataLoader";
import { getOrSet, remove } from "../utils";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { RelationT, RelationU } from "./Relation";

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
    public fieldName: keyof T,
    public columnName: string,
    public otherMeta: EntityMetadata<U>,
    public otherFieldName: keyof U,
    public otherColumnName: string,
  ) {
    super();
    this.isCascadeDelete = otherMeta.config.__data.cascadeDeleteFields.includes(fieldName as any);
  }

  private filterDeleted(entities: U[], opts?: { withDeleted?: boolean }): U[] {
    return opts?.withDeleted === true ? [...entities] : entities.filter((e) => !e.isDeletedEntity);
  }

  async load(opts?: { withDeleted?: boolean }): Promise<ReadonlyArray<U>> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (this.loaded === undefined) {
      const key = `${this.columnName}=${this.entity.id}`;
      this.loaded = await manyToManyDataLoader(getEm(this.entity), this).load(key);
      this.maybeApplyAddedAndRemovedBeforeLoaded();
    }
    return this.filterDeleted(this.loaded!, opts) as ReadonlyArray<U>;
  }

  async find(id: IdOf<U>): Promise<U | undefined> {
    return (await this.load()).find((u) => u.id === id);
  }

  add(other: U, percolated = false): void {
    ensureNotDeleted(this.entity);

    if (this.loaded !== undefined) {
      if (this.loaded.includes(other)) {
        return;
      }
      this.loaded.push(other);
    } else {
      if (this.addedBeforeLoaded.includes(other)) {
        return;
      }
      this.addedBeforeLoaded.push(other);
    }

    if (!percolated) {
      const joinRow: JoinRow = {
        id: undefined,
        m2m: this,
        [this.columnName]: this.entity,
        [this.otherColumnName]: other,
      };
      getOrSet(getEm(this.entity).__data.joinRows, this.joinTableName, []).push(joinRow);
      (other[this.otherFieldName] as any as ManyToManyCollection<U, T>).add(this.entity, true);
    }
  }

  remove(other: U, percolated = false): void {
    ensureNotDeleted(this.entity, { ignore: "pending" });

    if (!percolated) {
      const joinRows = getOrSet(getEm(this.entity).__data.joinRows, this.joinTableName, []);
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
        getOrSet(getEm(this.entity).__data.joinRows, this.joinTableName, []).push(joinRow);
      }
      (other[this.otherFieldName] as any as ManyToManyCollection<U, T>).remove(this.entity, true);
    }

    if (this.loaded !== undefined) {
      remove(this.loaded, other);
    } else {
      remove(this.addedBeforeLoaded, other);
      this.removedBeforeLoaded.push(other);
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

  async refreshIfLoaded(): Promise<void> {
    ensureNotDeleted(this.entity);
    // TODO We should remember what load hints have been applied to this collection and re-apply them.
    if (this.loaded !== undefined && this.entity.id !== undefined) {
      const key = `${this.columnName}=${this.entity.id}`;
      this.loaded = await manyToManyDataLoader(getEm(this.entity), this).load(key);
    }
  }

  maybeCascadeDelete() {
    if (this.isCascadeDelete) {
      this.current({ withDeleted: true }).forEach(getEm(this.entity).delete);
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
        const em = getEm(this.entity);
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

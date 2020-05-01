import DataLoader from "dataloader";
import { Collection, ensureNotDeleted, Entity, EntityConstructor, IdOf } from "../";
import { getOrSet, remove } from "../utils";
import { keyToNumber, keyToString } from "../serde";
import { AbstractRelationImpl } from "./AbstractRelationImpl";

export class ManyToManyCollection<T extends Entity, U extends Entity> extends AbstractRelationImpl<U[]>
  implements Collection<T, U> {
  private loaded: U[] | undefined;
  private addedBeforeLoaded: U[] = [];
  private removedBeforeLoaded: U[] = [];

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
    public otherType: EntityConstructor<U>,
    public otherFieldName: keyof U,
    public otherColumnName: string,
  ) {
    super();
  }

  async load(): Promise<ReadonlyArray<U>> {
    ensureNotDeleted(this.entity);
    if (this.loaded === undefined) {
      // TODO This key is basically a Reference, whenever we have that.
      // TODO Unsaved entities should never get here
      const key = `${this.columnName}=${this.entity.id}`;
      this.loaded = await loaderForJoinTable(this).load(key);
      this.maybeApplyAddedAndRemovedBeforeLoaded();
    }
    return this.loaded as ReadonlyArray<U>;
  }

  async find(id: IdOf<U>): Promise<U | undefined> {
    return (await this.load()).find(u => u.id === id);
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
      const joinRow: JoinRow = { id: undefined, [this.columnName]: this.entity, [this.otherColumnName]: other };
      getOrSet(this.entity.__orm.em.__data.joinRows, this.joinTableName, []).push(joinRow);
      ((other[this.otherFieldName] as any) as ManyToManyCollection<U, T>).add(this.entity, true);
    }
  }

  remove(other: U): void {
    ensureNotDeleted(this.entity);
    const joinRows = getOrSet(this.entity.__orm.em.__data.joinRows, this.joinTableName, []);
    const row = joinRows.find((r) => r[this.columnName] === this.entity && r[this.otherColumnName] === other);
    if (row) {
      row.deleted = true;
    }

    if (this.loaded !== undefined) {
      remove(this.loaded, other);
    } else {
      remove(this.addedBeforeLoaded, other);
      this.removedBeforeLoaded.push(other);
    }
  }

  get get(): U[] {
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
      const loader = loaderForJoinTable(this);
      loader.clear(key);
      this.loaded = await loader.load(key);
    }
  }

  /** Some random entity got deleted, if it was in our collection, remove it. */
  onDeleteOfMaybeOtherEntity(maybeOther: Entity): void {
    ensureNotDeleted(this.entity);
    if (this.current().includes(maybeOther as U)) {
      this.remove(maybeOther as U);
    }
  }

  async onEntityDeletedAndFlushing(): Promise<void> {}

  private maybeApplyAddedAndRemovedBeforeLoaded(): void {
    if (this.loaded) {
      // this.loaded.unshift(...this.addedBeforeLoaded);
      // this.addedBeforeLoaded = [];
      this.removedBeforeLoaded.forEach((e) => {
        remove(this.loaded!, e);
        const { em } = this.entity.__orm;
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

  current(): U[] {
    return this.loaded || this.addedBeforeLoaded;
  }
}

export type JoinRow = {
  id: number | undefined;
  created_at?: Date;
  [column: string]: number | Entity | undefined | boolean | Date;
  deleted?: boolean;
};

function loaderForJoinTable<T extends Entity, U extends Entity>(collection: ManyToManyCollection<T, U>) {
  const { joinTableName } = collection;
  const { em } = collection.entity.__orm;
  return getOrSet(em.__data.loaders, joinTableName, () => {
    return new DataLoader<string, Entity[]>(async (keys) => loadFromJoinTable(collection, keys));
  });
}

/**
 * Loads join rows (batched).
 *
 * I.e. we can load the `books_to_tags` join rows for multiple `Book`s at a time, or even
 * load `books_to_tags` for several `Book`s and several `Tag`s in a single SQL query.
 */
async function loadFromJoinTable<T extends Entity, U extends Entity>(
  collection: ManyToManyCollection<T, U>,
  keys: ReadonlyArray<string>,
): Promise<Entity[][]> {
  const { joinTableName } = collection;
  const { em } = collection.entity.__orm;

  // Break out `column_id=string` keys out
  const columns: Record<string, string[]> = {};
  keys.forEach((key) => {
    const [columnId, id] = key.split("=");
    getOrSet(columns, columnId, []).push(id);
  });

  // Or together `where tag_id in (...)` and `book_id in (...)`
  let query = em.knex.select("*").from(joinTableName);
  Object.entries(columns).forEach(([columnId, values]) => {
    query = query.orWhereIn(
      columnId,
      values.map((id) => keyToNumber(id)!),
    );
  });

  const rows: JoinRow[] = await query.orderBy("id");

  // Make a map that will be both `tag_id=2 -> [...]` and `book_id=3 -> [...]`
  const rowsByKey: Record<string, JoinRow[]> = {};

  // Keep a reference to our row to track updates/deletes
  const emJoinRows = getOrSet(em.__data.joinRows, joinTableName, []);

  // The order of column1/column2 doesn't really matter, i.e. if the opposite-side collection is later used
  const column1 = collection.columnName;
  const cstr1 = collection.entity.__orm.metadata.cstr;
  const column2 = collection.otherColumnName;
  const cstr2 = collection.otherType;

  // For each join table row, we use `EntityManager.load` to get both entities loaded.
  // This will be another 1 or 2 queries (depending on whether we're loading just
  // `book.getTags` (1 query to load new tags) or both `book.getTags` and `tag.getBooks
  // (1 query to load the new tags and 1 query to look the new books)).
  //
  // Eventually we could have this query join into the entity tables themselves, i.e.
  // `books` and `tags`, and use those results to hydrate the newly-found entities.
  await Promise.all(
    rows.map(async (dbRow) => {
      // We may have already loaded this join row in a prior load of the opposite side of this m2m.
      let emRow = emJoinRows.find((jr) => {
        return (
          (jr[column1] as Entity).id === keyToString(dbRow[column1]) &&
          (jr[column2] as Entity).id === keyToString(dbRow[column2])
        );
      });

      if (!emRow) {
        // For this join table row, load the entities of both foreign keys. Because we are `EntityManager.load`,
        // this is N+1 safe (and will check the Unit of Work for already-loaded entities), but per ^ comment
        // we chould pull these from the row itself if we did a fancier join.
        const p1 = em.load(cstr1, keyToString(dbRow[column1])!);
        const p2 = em.load(cstr2, keyToString(dbRow[column2])!);
        const [e1, e2] = await Promise.all([p1, p2]);
        emRow = { id: dbRow.id, [column1]: e1, [column2]: e2, created_at: dbRow.created_at };
        emJoinRows.push(emRow);
      }

      // Put this row into the map for both join table columns, i.e. `book_id=2` and `tag_id=3`
      getOrSet(rowsByKey, `${column1}=${(emRow[column1] as Entity).id}`, []).push(emRow);
      getOrSet(rowsByKey, `${column2}=${(emRow[column2] as Entity).id}`, []).push(emRow);
    }),
  );

  // Map the requested keys, i.e. book_id=2 back to "the tags for book 2".
  return keys.map((key) => {
    const [column] = key.split("=");
    const joinRows = rowsByKey[key] || [];
    const otherColumn = column === collection.columnName ? collection.otherColumnName : collection.columnName;
    return joinRows.map((joinRow) => joinRow[otherColumn] as Entity);
  });
}

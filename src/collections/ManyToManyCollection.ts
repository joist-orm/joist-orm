import DataLoader from "dataloader";
import { Collection } from "../index";
import { Entity, EntityConstructor } from "../EntityManager";
import { getOrSet } from "../utils";
import { keyToNumber, keyToString } from "../serde";

export class ManyToManyCollection<T extends Entity, U extends Entity> implements Collection<T, U> {
  private loaded: U[] | undefined;
  private addedBeforeLoaded: U[] = [];

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
  ) {}

  async load(): Promise<ReadonlyArray<U>> {
    if (this.loaded === undefined) {
      // TODO This is basically a reference
      // TODO Unsaved entities should never get here
      const key = `${this.columnName}=${this.entity.id}`;
      this.loaded = await loaderForJoinTable(this).load(key);
    }
    return this.loaded as ReadonlyArray<U>;
  }

  add(other: U, percolated = false): void {
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
      getOrSet(this.entity.__orm.em.joinRows, this.joinTableName, []).push(joinRow);
      ((other[this.otherFieldName] as any) as ManyToManyCollection<U, T>).add(this.entity, true);
    }
  }

  get get(): U[] {
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
}

export type JoinRow = {
  id: number | undefined;
  created_at?: Date;
  [column: string]: number | Entity | undefined | Date;
};

function loaderForJoinTable<T extends Entity, U extends Entity>(collection: ManyToManyCollection<T, U>) {
  const { joinTableName } = collection;
  const { em } = collection.entity.__orm;
  return getOrSet(em.loaders, joinTableName, () => {
    return new DataLoader<string, Entity[]>(async keys => loadFromJoinTable(collection, keys));
  });
}

/** Loads join rows. */
async function loadFromJoinTable<T extends Entity, U extends Entity>(
  collection: ManyToManyCollection<T, U>,
  keys: ReadonlyArray<string>,
): Promise<Entity[][]> {
  const { joinTableName } = collection;
  const { em } = collection.entity.__orm;

  // Break out `column_id=string` keys out
  const columns: Record<string, string[]> = {};
  keys.forEach(key => {
    const [columnId, id] = key.split("=");
    getOrSet(columns, columnId, []).push(id);
  });

  // Or together `where tag_id in (...)` and `book_id in (...)`
  let query = em.knex.select("*").from(joinTableName);
  Object.entries(columns).forEach(([columnId, values]) => {
    query = query.orWhereIn(
      columnId,
      values.map(id => keyToNumber(id)!),
    );
  });

  const rows = (await query.orderBy("id")) as JoinRow[];

  // Make a map that will be both `tag_id=2 -> [...]` and `book_id=3 -> [...]`
  const rowsByKey: Record<string, JoinRow[]> = {};

  // Each join table row might have some promises to load the other entity. Eventually
  // we should just pull the other side in via the ^ query (even if some of the rows
  // might already be in our UoW).
  const p = rows.map(async row => {
    // Keep a reference to our row to track updates/deletes
    getOrSet(em.joinRows, joinTableName, []).push(row);

    // For this join table row, resolve the entities both of foreign keys. For now
    // we're using the EntityManager.load to do this for this (in batch so it is N+1 safe),
    // but eventually we should pull those into the row itself.
    const p = Object.entries(row).map(async entry => {
      const [column, value] = entry;
      if (column === "id" || column === "created_at") {
        return;
      }

      const cstr = (column === collection.columnName
        ? collection.entity.__orm.metadata.cstr
        : collection.otherType) as EntityConstructor<any>;
      row[column] = await em.load(cstr, keyToString(value)!);

      // Put this row into the map for both join table columns, i.e. `book_id=2` and `tag_id=3`
      const key = `${column}=${value}`;
      getOrSet(rowsByKey, key, []).push(row);
    });
    await Promise.all(p);
  });
  await Promise.all(p);

  // Map the requested keys, i.e. book_id=2 back to "the tags for book 2".
  return keys.map(key => {
    const [column] = key.split("=");
    const joinRows = rowsByKey[key] || [];
    const otherColumn = column === collection.columnName ? collection.otherColumnName : collection.columnName;
    return joinRows.map(joinRow => joinRow[otherColumn] as Entity);
  });
}

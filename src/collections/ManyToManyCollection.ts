import DataLoader from "dataloader";
import { Collection } from "../index";
import { Entity, EntityConstructor } from "../EntityManager";
import { getOrSet } from "../utils";
import { keyToNumber, keyToString } from "../serde";

export class ManyToManyCollection<T extends Entity, U extends Entity> implements Collection<T, U> {
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
    // TODO This is basically a reference
    // TODO Unsaved entities should never get here
    const key = `${this.columnName}=${this.entity.id}`;
    return loaderForJoinTable(this).load(key);
  }

  add(other: U): void {}
}

type JoinRow = { id: number; created_at: Date } & { [column: string]: number | Entity };

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

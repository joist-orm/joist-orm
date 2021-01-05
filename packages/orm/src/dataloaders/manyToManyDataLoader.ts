import DataLoader from "dataloader";
import { JoinRow } from "../collections/ManyToManyCollection";
import { Entity, EntityManager } from "../EntityManager";
import { getEm, keyToString, ManyToManyCollection } from "../index";
import { getOrSet } from "../utils";

export function manyToManyDataLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  collection: ManyToManyCollection<T, U>,
) {
  return getOrSet(em.loadLoaders, collection.joinTableName, () => {
    return new DataLoader<string, Entity[]>((keys) => load(collection, keys));
  });
}

/**
 * Loads join rows (batched).
 *
 * I.e. we can load the `books_to_tags` join rows for multiple `Book`s at a time, or even
 * load `books_to_tags` for several `Book`s and several `Tag`s in a single SQL query.
 */
async function load<T extends Entity, U extends Entity>(
  collection: ManyToManyCollection<T, U>,
  keys: ReadonlyArray<string>,
): Promise<Entity[][]> {
  const { joinTableName } = collection;
  const em = getEm(collection.entity);

  // Make a map that will be both `tag_id=2 -> [...]` and `book_id=3 -> [...]`
  const rowsByKey: Record<string, JoinRow[]> = {};

  // Keep a reference to our row to track updates/deletes
  const emJoinRows = getOrSet(em.__data.joinRows, joinTableName, []);

  const rows = await em.driver.loadManyToMany(collection, keys);

  // The order of column1/column2 doesn't really matter, i.e. if the opposite-side collection is later used
  const column1 = collection.columnName;
  const meta1 = collection.entity.__orm.metadata;
  const column2 = collection.otherColumnName;
  const meta2 = collection.otherMeta;

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
          (jr[column1] as Entity).id === keyToString(meta1, dbRow[column1]) &&
          (jr[column2] as Entity).id === keyToString(meta2, dbRow[column2])
        );
      });

      if (!emRow) {
        // For this join table row, load the entities of both foreign keys. Because we are `EntityManager.load`,
        // this is N+1 safe (and will check the Unit of Work for already-loaded entities), but per ^ comment
        // we chould pull these from the row itself if we did a fancier join.
        const p1 = em.load(meta1.cstr, keyToString(meta1, dbRow[column1])!);
        const p2 = em.load(meta2.cstr, keyToString(meta2, dbRow[column2])!);
        const [e1, e2] = await Promise.all([p1, p2]);
        emRow = { id: dbRow.id, m2m: collection, [column1]: e1, [column2]: e2, created_at: dbRow.created_at };
        emJoinRows.push(emRow);
      } else {
        // If a placeholder row was created while a ManyToManyCollection was unloaded, and we find it during
        // a subsequent load/query, update its id to be what is in the database.
        emRow.id = dbRow.id;
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

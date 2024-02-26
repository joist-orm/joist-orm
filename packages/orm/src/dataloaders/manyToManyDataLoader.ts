import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { EntityManager, getEmInternalApi } from "../EntityManager";
import { JoinRow } from "../JoinRows";
import { ManyToManyCollection, ParsedFindQuery, abbreviation, getMetadata, keyToNumber } from "../index";
import { getOrSet } from "../utils";

/** Batches m2m.load calls. */
export function manyToManyDataLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  collection: ManyToManyCollection<T, U>,
): DataLoader<string, U[]> {
  // Note that we cache the dataloader on the joinTableName, and not
  // which side of the relation the `collection` is coming from, so
  // the `load` impl will have to handle keys that come from either
  // side of the relation.
  return em.getLoader("m2m-load", collection.joinTableName, (keys) => load(collection, keys));
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
): Promise<U[][]> {
  const { em } = collection.entity;

  // Make a map that will be both `tag_id=t:2 -> [...]` and `book_id=b:3 -> [...]`
  const rowsByKey: Record<string, JoinRow[]> = {};
  // Keep a reference to our row to track updates/deletes
  const joinRows = getEmInternalApi(em).joinRows(collection);

  // Break out `column_id=string` keys out
  const columns: Record<string, string[]> = {};
  keys.forEach((key) => {
    const [columnId, id] = key.split("=");
    getOrSet(columns, columnId, []).push(id);
  });

  const alias = abbreviation(collection.joinTableName);
  const query: ParsedFindQuery = {
    selects: [`"${alias}".*`],
    tables: [{ alias, join: "primary", table: collection.joinTableName }],
    // Or together `where tag_id in (...)` or `book_id in (...)` if we're loading both sides simultaneously
    condition: {
      kind: "exp",
      op: "or",
      conditions: Object.entries(columns).map(([columnId, values]) => {
        // Pick the right meta i.e. tag_id --> TagMeta or book_id --> BookMeta
        const meta = collection.columnName == columnId ? getMetadata(collection.entity) : collection.otherMeta;
        return {
          kind: "column",
          alias,
          column: columnId,
          dbType: meta.idDbType,
          cond: { kind: "in", value: values.map((id) => keyToNumber(meta, id)!) },
        };
      }),
    },
    orderBys: [{ alias, column: "id", order: "ASC" }],
  };

  // maybeAddNotSoftDeleted(conditions, meta, alias, "include");
  const rows = await em.driver.executeFind(em, query, {});

  // The order of column1/column2 doesn't really matter, i.e. if the opposite-side collection is later used
  const { columnName: column1, otherColumnName: column2 } = collection;

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
      const emRow = await joinRows.findForRow(dbRow);
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
    return joinRows.map((joinRow) => joinRow[otherColumn] as U);
  });
}

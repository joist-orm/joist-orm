import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { EntityManager } from "../EntityManager";
import { keyToNumber, ManyToManyCollection, ManyToManyLargeCollection, ParsedFindQuery, tagId } from "../index";
import { abbreviation } from "../utils";

/** Batches m2m.find/include calls (i.e. that don't fully load the m2m relation). */
export function manyToManyFindDataLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  collection: ManyToManyCollection<T, U> | ManyToManyLargeCollection<T, U>,
): DataLoader<string, boolean> {
  return em.getLoader("m2m-find", collection.joinTableName, (keys) => load(collection, keys));
}

async function load<T extends Entity, U extends Entity>(
  collection: ManyToManyCollection<T, U> | ManyToManyLargeCollection<T, U>,
  keys: ReadonlyArray<string>,
): Promise<boolean[]> {
  const { joinTableName } = collection;
  const { em } = collection.entity;

  const alias = abbreviation(joinTableName);
  const query: ParsedFindQuery = {
    selects: [`"${alias}".*`],
    tables: [{ alias, join: "primary", table: joinTableName }],
    // Or together `where (tag_id = X and book_id = Y)` or `(book_id = B and tag_id = A)`
    condition: {
      kind: "exp",
      op: "or",
      conditions: keys.map((key) => {
        const [one, two] = key.split(",");
        const [columnOne, idOne] = one.split("=");
        const [columnTwo, idTwo] = two.split("=");
        // Pick the right meta i.e. tag_id --> TagMeta or book_id --> BookMeta
        const [meta1, meta2] =
          collection.columnName === columnOne
            ? [collection.meta, collection.otherMeta]
            : [collection.otherMeta, collection.meta];
        return {
          kind: "exp",
          op: "and",
          conditions: [
            {
              kind: "column",
              alias,
              column: columnOne,
              dbType: meta1.idDbType,
              cond: { kind: "eq", value: keyToNumber(meta1, idOne) },
            },
            {
              kind: "column",
              alias,
              column: columnTwo,
              dbType: meta2.idDbType,
              cond: { kind: "eq", value: keyToNumber(meta2, idTwo) },
            },
          ],
        };
      }),
    },
    orderBys: [{ alias, column: "id", order: "ASC" }],
  };

  const rows = await em.driver.executeFind(em, query, {});

  const column1 = collection.columnName;
  const column2 = collection.otherColumnName;
  const meta1 = collection.meta;
  const meta2 = collection.otherMeta;

  // Because keys might come from either side of the m2m relationship, build
  // a list of both `foo_id=2,bar_id=3` and `bar_id=3,foo_id=2` to make the
  // final return value just a map of `Set.has`.
  const found = new Set(
    rows.flatMap((dbRow) => {
      const a = `${column1}=${tagId(meta1, dbRow[column1] as number)}`;
      const b = `${column2}=${tagId(meta2, dbRow[column2] as number)}`;
      return [`${a},${b}`, `${b},${a}`];
    }),
  );

  return keys.map((key) => found.has(key));
}

import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { EntityManager } from "../EntityManager";
import {
  OneToManyCollection,
  OneToManyLargeCollection,
  ParsedFindQuery,
  addTablePerClassJoinsAndClassTag,
  keyToNumber,
} from "../index";
import { abbreviation } from "../utils";

export const oneToManyFindOperation = "o2m-find";

/** Batches o2m.find/include calls (i.e. that don't fully load the o2m relation). */
export function oneToManyFindDataLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  collection: OneToManyCollection<T, U> | OneToManyLargeCollection<T, U>,
): DataLoader<string, U | undefined> {
  const { meta } = collection;
  const batchKey = `${meta.tableName}-${collection.fieldName}`;
  return em.getLoader(oneToManyFindOperation, batchKey, async (keys) => {
    const { em } = collection.entity;

    const meta = collection.otherMeta;
    const alias = abbreviation(meta.tableName);
    const query: ParsedFindQuery = {
      selects: [`"${alias}".*`],
      tables: [{ alias, join: "primary", table: meta.tableName }],
      // Or together `where (id = X and book_id = Y)`
      condition: {
        kind: "exp",
        op: "or",
        conditions: keys.map((key) => {
          const [one, two] = key.split(",");
          // columnOne is the `id=`, so is really the "other" side of the o2m
          const [columnOne, idOne] = one.split("=");
          const [columnTwo, idTwo] = two.split("=");
          const [meta1, meta2] = [collection.otherMeta, collection.meta];
          // Pick the right meta i.e. tag_id --> TagMeta or book_id --> BookMeta
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

    addTablePerClassJoinsAndClassTag(query, meta, alias, true);
    // Skip maybeAddOrderBy b/c we're only returning 1 result
    // maybeAddNotSoftDeleted(conditions, meta, alias, "include");

    const rows = await em["executeFind"](collection.otherMeta, oneToManyFindOperation, query, {});
    em.hydrate(collection.otherMeta.cstr, rows);

    // Decode `id=b:1,author_id=a:1`
    return keys.map((k) => {
      const [otherKey, parentKey] = k.split(",");
      const [, otherId] = otherKey.split("=");
      const [, parentId] = parentKey.split("=");
      const other = em.getEntity(otherId) as U;
      // We have may fetched `other` for a different parent in our batch
      const isMine = (other as any)?.[collection.otherFieldName].id === parentId;
      return isMine ? other : undefined;
    });
  });
}

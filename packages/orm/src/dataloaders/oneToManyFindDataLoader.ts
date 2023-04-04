import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { EntityManager, IdOf } from "../EntityManager";
import {
  abbreviation,
  addTablePerClassJoinsAndClassTag,
  keyToNumber,
  OneToManyCollection,
  OneToManyLargeCollection,
  ParsedFindQuery,
} from "../index";
import { getOrSet } from "../utils";

/** Batches o2m.find/include calls (i.e. that don't fully load the o2m relation). */
export function oneToManyFindDataLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  collection: OneToManyCollection<T, U> | OneToManyLargeCollection<T, U>,
): DataLoader<string, U | undefined> {
  const { meta } = collection;
  const loaderName = `find-${meta.tableName}.${collection.fieldName}`;
  return getOrSet(em.loadLoaders, loaderName, () => {
    return new DataLoader<string, U | undefined>(async (keys) => {
      const { em } = collection.entity;

      const meta = collection.otherMeta;
      const alias = abbreviation(meta.tableName);
      const query: ParsedFindQuery = {
        selects: [`"${alias}".*`],
        tables: [{ alias, join: "primary", table: meta.tableName }],
        conditions: [],
        complexConditions: [
          {
            // Or together `where (id = X and book_id = Y)`
            op: "or",
            conditions: keys.map((key) => {
              const [one, two] = key.split(",");
              // columnOne is the `id=`, so is really the "other" side of the o2m
              const [columnOne, idOne] = one.split("=");
              const [columnTwo, idTwo] = two.split("=");
              const [meta1, meta2] = [collection.otherMeta, collection.meta];
              // Pick the right meta i.e. tag_id --> TagMeta or book_id --> BookMeta
              return {
                op: "and",
                conditions: [
                  { alias, column: columnOne, cond: { kind: "eq", value: keyToNumber(meta1, idOne) } },
                  { alias, column: columnTwo, cond: { kind: "eq", value: keyToNumber(meta2, idTwo) } },
                ],
              };
            }),
          },
        ],
        orderBys: [{ alias, column: "id", order: "ASC" }],
      };

      addTablePerClassJoinsAndClassTag(query, meta, alias, true);
      // maybeAddNotSoftDeleted(conditions, meta, alias, "include");

      const rows = await em.driver.executeFind(em, query, {});

      const entities = rows.map((row) => em.hydrate(collection.otherMeta.cstr, row, { overwriteExisting: false }));
      // Decode `id=b:1,author_id=a:1`
      return keys.map((k) => {
        const [otherKey, parentKey] = k.split(",");
        const [, otherId] = otherKey.split("=");
        const [, parentId] = parentKey.split("=");
        const other = em.getEntity(otherId as IdOf<U>);
        // We have may fetched `other` for a different parent in our batch
        const isMine = (other as any)?.[collection.otherFieldName].id === parentId;
        return isMine ? other : undefined;
      });
    });
  });
}

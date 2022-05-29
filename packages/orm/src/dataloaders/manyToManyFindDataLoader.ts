import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { EntityManager } from "../EntityManager";
import { ManyToManyCollection, ManyToManyLargeCollection, tagId } from "../index";
import { getOrSet } from "../utils";

/** Batches m2m.find/include calls (i.e. that don't fully load the m2m relation). */
export function manyToManyFindDataLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  collection: ManyToManyCollection<T, U> | ManyToManyLargeCollection<T, U>,
): DataLoader<string, boolean> {
  return getOrSet(
    em.loadLoaders,
    `find-${collection.joinTableName}`,
    () => new DataLoader<string, boolean>((keys) => load(collection, keys)),
  );
}

async function load<T extends Entity, U extends Entity>(
  collection: ManyToManyCollection<T, U> | ManyToManyLargeCollection<T, U>,
  keys: ReadonlyArray<string>,
): Promise<boolean[]> {
  const { joinTableName } = collection;
  const { em } = collection.entity;

  const rows = await em.driver.findManyToMany(em, collection, keys);

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

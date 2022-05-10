import DataLoader from "dataloader";
import { Entity, EntityManager, IdOf } from "../EntityManager";
import { OneToManyCollection, OneToManyLargeCollection } from "../index";
import { getOrSet } from "../utils";

/** Batches o2m.find/include calls (i.e. that don't fully load the o2m relation). */
export function oneToManyFindDataLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  collection: OneToManyCollection<T, U> | OneToManyLargeCollection<T, U>,
): DataLoader<string, U | undefined> {
  const { meta, fieldName } = collection;
  const loaderName = `find-${meta.tableName}.${collection.fieldName}`;
  return getOrSet(em.loadLoaders, loaderName, () => {
    return new DataLoader<string, U | undefined>(async (keys) => {
      const { em } = collection.entity;
      const rows = await em.driver.findOneToMany(em, collection, keys);
      const entities = rows.map((row) => em.hydrate(collection.otherMeta.cstr, row, { overwriteExisting: false }));
      // Decode `id=b:1,author_id=a:1`
      return keys.map((k) => {
        const [otherKey, parentKey] = k.split(",");
        const [, otherId] = otherKey.split("=");
        const [, parentId] = parentKey.split("=");
        const other = em.getEntity(collection.otherMeta.tableName, otherId as IdOf<U>);
        // We have may fetched `other` for a different parent in our batch
        const isMine = (other as any)?.[collection.otherFieldName].id === parentId;
        return isMine ? other : undefined;
      });
    });
  });
}

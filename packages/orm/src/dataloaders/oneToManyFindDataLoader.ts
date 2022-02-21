import DataLoader from "dataloader";
import { Entity, EntityManager, IdOf } from "../EntityManager";
import { getEm, OneToManyCollection } from "../index";
import { getOrSet } from "../utils";

/** Batches o2m.find/include calls (i.e. that don't fully load the o2m relation). */
export function oneToManyFindDataLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  collection: OneToManyCollection<T, U>,
): DataLoader<string, U | undefined> {
  const { meta, fieldName } = collection;
  const loaderName = `find-${meta.tableName}.${collection.fieldName}`;
  return getOrSet(em.loadLoaders, loaderName, () => {
    return new DataLoader<string, U | undefined>(async (keys) => {
      const em = getEm(collection.entity);
      const rows = await em.driver.findOneToMany(em, collection, keys);
      const entities = rows.map((row) => em.hydrate(collection.otherMeta.cstr, row, { overwriteExisting: false }));
      // Decode `id=a:1,book_id=b:2`
      return keys.map((k) => {
        const [key1] = k.split(",");
        const [, id1] = key1.split("=");
        return em.getEntity(id1 as IdOf<U>);
      });
    });
  });
}

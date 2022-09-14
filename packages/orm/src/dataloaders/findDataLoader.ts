import DataLoader from "dataloader";
import hash from "object-hash";
import { Entity, isEntity } from "../Entity";
import { EntityConstructor, EntityManager } from "../EntityManager";
import { FilterAndSettings } from "../QueryBuilder";
import { getOrSet } from "../utils";

export function findDataLoader<T extends Entity>(
  em: EntityManager,
  type: EntityConstructor<T>,
): DataLoader<FilterAndSettings<T>, unknown[]> {
  return getOrSet(em.findLoaders, type.name, () => {
    return new DataLoader<FilterAndSettings<T>, unknown[], string>(
      (queries) => {
        return em.driver.find(em, type, queries);
      },
      {
        // Our filter/order tuple is a complex object, so object-hash it to ensure caching works
        cacheKeyFn: whereFilterHash,
      },
    );
  });
}

// If a where clause includes an entity, object-hash cannot hash it, so just use the id.
const replacer = (v: any) => (isEntity(v) ? v.id : v);

export function whereFilterHash(where: FilterAndSettings<any>): string {
  return hash(where, { replacer, algorithm: "md5" });
}

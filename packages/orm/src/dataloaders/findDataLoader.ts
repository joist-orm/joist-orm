import DataLoader from "dataloader";
import hash from "object-hash";
import { isAlias } from "../Aliases";
import { Entity, isEntity } from "../Entity";
import { FilterAndSettings } from "../EntityFilter";
import { EntityManager, MaybeAbstractEntityConstructor } from "../EntityManager";

export function findDataLoader<T extends Entity>(
  em: EntityManager,
  type: MaybeAbstractEntityConstructor<T>,
): DataLoader<FilterAndSettings<T>, unknown[]> {
  return em.getLoader(
    "find",
    type.name,
    (queries) => em.driver.find(em, type, queries),
    // Our filter/order tuple is a complex object, so object-hash it to ensure caching works
    { cacheKeyFn: whereFilterHash },
  );
}

// If a where clause includes an entity, object-hash cannot hash it, so just use the id.
function replacer(v: any) {
  if (isEntity(v)) {
    return v.id;
  }
  // Strip out `{ as: ...alias proxy... }` from the `em.find` inline conditions
  if (isAlias(v)) {
    return "alias";
  }
  return v;
}

export function whereFilterHash(where: FilterAndSettings<any>): any {
  return hash(where, { replacer, algorithm: "md5" });
}

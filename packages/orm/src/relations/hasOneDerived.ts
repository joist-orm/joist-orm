import { currentlyInstantiatingEntity } from "../";
import { Entity } from "../EntityManager";
import { Loaded, LoadHint } from "../loaded";
import { CustomReference } from "./CustomReference";
import { Reference } from "./Reference";

/**
 * Creates a CustomReference that can conditionally walk across references in the object graph.
 *
 * I.e. A BookReview "has one author" through the `review -> book -> author` relation.
 *
 * Because this is based on `CustomReference`, it will work in populates, i.e. `em.populate(review, "author")`.
 */
export function hasOneDerived<
  T extends Entity,
  U extends Entity,
  N extends never | undefined,
  V extends U | N,
  H extends LoadHint<T>,
>(loadHint: H, get: (entity: Loaded<T, H>) => V): Reference<T, U, N> {
  const entity: T = currentlyInstantiatingEntity as T;
  return new CustomReference<T, U, N>(entity, {
    load: async (entity) => {
      await entity.em.populate(entity, loadHint);
    },
    get: () => get(entity as Loaded<T, H>),
  });
}

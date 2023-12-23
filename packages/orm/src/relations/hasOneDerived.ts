import { isLoaded } from "../";
import { currentlyInstantiatingEntity } from "../BaseEntity";
import { Entity } from "../Entity";
import { LoadHint, Loaded } from "../loadHints";
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
  const H extends LoadHint<T>,
>(loadHint: H, get: (entity: Loaded<T, H>) => V): Reference<T, U, N> {
  const entity: T = currentlyInstantiatingEntity as T;
  return new CustomReference<T, U, N>(entity, {
    load: (entity, opts) => entity.em.populate(entity, { hint: loadHint, ...opts }),
    get: () => get(entity as Loaded<T, H>),
    isLoaded: () => isLoaded(entity, loadHint as LoadHint<T>),
  });
}

import { isLoaded } from "..//index.ts";
import { type Entity } from "../Entity.ts";
import { type LoadHint, type Loaded } from "../loadHints.ts";
import { lazyField } from "../newEntity.ts";
import { CustomReference } from "./CustomReference.ts";
import { type Reference } from "./Reference.ts";

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
  return lazyField((entity: T) => {
    return new CustomReference<T, U, N>(entity, {
      load: (entity, opts) => entity.em.populate(entity, { hint: loadHint, ...opts }),
      get: () => get(entity as Loaded<T, H>),
      isLoaded: () => isLoaded(entity, loadHint as LoadHint<T>),
      loadHint,
    });
  });
}

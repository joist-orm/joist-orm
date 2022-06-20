import { Const, currentlyInstantiatingEntity, Reacted, ReactiveHint } from "../";
import { Entity } from "../Entity";
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
  H extends ReactiveHint<T>,
>(hint: Const<H>, get: (entity: Reacted<T, H>) => Reacted<U, {}> | N): Reference<T, U, N> {
  const entity: T = currentlyInstantiatingEntity as T;
  const reference = new CustomReference<T, U, N>(entity, {
    load: async (entity, opts) => {
      await entity.em.populate(entity as Entity, { hint, ...opts });
    },
    get: () => get(entity as Reacted<T, H>) as U | N,
  });
  (reference as any).hint = hint;
  return reference;
}

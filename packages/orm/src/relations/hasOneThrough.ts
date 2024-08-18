import { currentlyInstantiatingEntity } from "../BaseEntity";
import { CustomReference, Entity, getLens, getMetadata, isLensLoaded, Lens, loadLens, Reference } from "../index";

/**
 * Creates a CustomReference that will walk across references in the object graph.
 *
 * I.e. A BookReview "has one author" through the `review -> book -> author` relation.
 *
 * Because this is based on `CustomReference`, it will work in populates, i.e. `em.populate(review, "author")`.
 */
export function hasOneThrough<T extends Entity, U extends Entity, N extends never | undefined, V extends U | N>(
  lens: (lens: Lens<T>) => Lens<V>,
): Reference<T, U, N> {
  const entity: T = currentlyInstantiatingEntity as T;
  const meta = getMetadata(entity);
  return new CustomReference<T, U, N>(entity, {
    load: (entity, opts) => loadLens(entity, lens, opts),
    get: () => getLens(meta, entity, lens),
    isLoaded: () => isLensLoaded(entity, lens),
  });
}

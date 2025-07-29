import { currentlyInstantiatingEntity } from "../BaseEntity";
import {
  Collection,
  CustomCollection,
  Entity,
  getLens,
  getMetadata,
  isLensLoaded,
  Lens,
  lensToLoadHint,
  loadLens,
} from "../index";

/**
 * Creates a CustomCollection that will walk across references in the object graph.
 *
 * I.e. An Author "has many reviews" through the `author -> books -> reviews` relation.
 *
 * Because this is based on `CustomCollection`, it will work in populates, i.e. `em.populate(author, "reviews")`.
 */
export function hasManyThrough<T extends Entity, U extends Entity>(
  lens: (lens: Lens<T>) => Lens<U, U[]>,
): Collection<T, U> {
  const entity: T = currentlyInstantiatingEntity as T;
  const meta = getMetadata(entity);
  return new CustomCollection<T, U>(entity, {
    load: (entity, opts) => loadLens(entity, lens, opts),
    get: () => getLens(meta, entity, lens),
    isLoaded: () => isLensLoaded(entity, lens),
    loadHint: () => lensToLoadHint(lens),
  });
}

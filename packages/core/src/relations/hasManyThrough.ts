import {
  type Collection,
  CustomCollection,
  type Entity,
  type Lens,
  getLens,
  getMetadata,
  isLensLoaded,
  lensToLoadHint,
  loadLens,
} from "../index.ts";
import { lazyField } from "../newEntity.ts";

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
  return lazyField((entity: T) => {
    const meta = getMetadata(entity);
    return new CustomCollection<T, U>(entity, {
      load: (entity, opts) => loadLens(entity, lens, opts),
      get: () => getLens(meta, entity, lens),
      isLoaded: () => isLensLoaded(entity, lens),
      loadHint: () => lensToLoadHint(lens),
    });
  });
}

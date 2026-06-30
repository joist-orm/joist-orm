import {
  CustomReference,
  Entity,
  getLensPath,
  getMetadata,
  isLensLoadedPath,
  Lens,
  lensPathToLoadHint,
  lensToPath,
  loadLensPath,
  Reference,
} from "../index";
import { lazyField } from "../newEntity";

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
  const paths = lensToPath(lens);
  const loadHint = lensPathToLoadHint<T>(paths);
  return lazyField((entity: T) => {
    const meta = getMetadata(entity);
    return new CustomReference<T, U, N>(entity, {
      load: (entity, opts) => loadLensPath(entity, paths, opts),
      get: () => getLensPath(meta, entity, paths),
      isLoaded: () => isLensLoadedPath(entity, paths),
      loadHint,
    });
  });
}

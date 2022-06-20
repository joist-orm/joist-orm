import {
  Collection,
  convertLensToLoadHint,
  currentlyInstantiatingEntity,
  CustomCollection,
  Entity,
  getLens,
  Lens,
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
  const collection = new CustomCollection<T, U>(entity, {
    load: async (entity, opts) => {
      await loadLens(entity, lens, opts);
    },
    get: () => getLens(entity, lens),
  });
  (collection as any).hint = convertLensToLoadHint(lens);
  return collection;
}

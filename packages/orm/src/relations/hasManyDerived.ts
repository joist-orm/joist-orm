import { Collection, currentlyInstantiatingEntity, isLoaded } from "../";
import { Entity } from "../Entity";
import { LoadHint, Loaded } from "../loadHints";
import { CustomCollection } from "./CustomCollection";

type HasManyDerivedOpts<T extends Entity, U extends Entity, H extends LoadHint<T>> = {
  load?: (entity: T, opts: { forceReload?: boolean }) => Promise<any>;
  get: (entity: Loaded<T, H>) => readonly U[];
  set?: (entity: Loaded<T, H>, values: U[]) => void;
  add?: (entity: Loaded<T, H>, value: U) => void;
  remove?: (entity: Loaded<T, H>, value: U) => void;
};

/**
 * Creates a CustomCollection that can conditionally walk across references in the object graph.
 *
 * I.e. An Author "has many reviews" through the `author -> books -> reviews` relation.
 *
 * Because this is based on `CustomCollection`, it will work in populates, i.e. `em.populate(author, "reviews")`.
 */
export function hasManyDerived<T extends Entity, U extends Entity, H extends LoadHint<T>>(
  loadHint: H,
  opts: HasManyDerivedOpts<T, U, H>,
): Collection<T, U> {
  const entity: T = currentlyInstantiatingEntity as T;
  const { load, ...rest } = opts;
  return new CustomCollection<T, U>(entity, {
    load(entity, opts) {
      if (load) {
        return load(entity, opts);
      } else {
        return entity.em.populate(entity, { hint: loadHint, ...opts });
      }
    },
    isLoaded: () => isLoaded(entity, loadHint),
    ...(rest as any),
  });
}

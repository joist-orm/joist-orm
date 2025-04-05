/**
 * Interface for our relations that have dynamic & expensive `isLoaded` checks.
 *
 * The primary m2o/o2m/m2m relations all have trivial `isLoaded` checks--are they
 * loaded or not.
 *
 * But for "composite relations", i.e. a ReactiveField or ReactiveRelation whose
 * "load-ness" is calculated by evaluating its load hint across a tree of entities
 * & relations, load-ness can be true-then-false, as its graph changes.
 *
 * To avoid performance issues, we cache this dynamic/expensive `isLoaded` checks,
 * and then do a fairly simplistic cache invalidation whenever any relation is
 * mutated.
 */
export interface IsLoadedCachable {
  isLoaded: boolean;
  resetIsLoaded(): void;
}

export class IsLoadedCache {
  private cache = new Set<IsLoadedCachable>();

  add(target: IsLoadedCachable): void {
    this.cache.add(target);
  }

  resetIsLoaded(): void {
    for (const target of this.cache.values()) {
      target.resetIsLoaded();
    }
    this.cache.clear();
  }
}

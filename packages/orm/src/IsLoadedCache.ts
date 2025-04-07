import { Entity } from "./Entity";
import { getMetadata } from "./EntityMetadata";

/**
 * Interface for our relations that have dynamic & expensive `isLoaded` checks.
 *
 * ...and also `OneToManyCollection.get`.
 *
 * The primary m2o/o2m/m2m relations all have trivial `isLoaded` checks--are they
 * loaded or not.
 *
 * But for "composite relations", i.e. a ReactiveField or ReactiveRelation whose
 * "load-ness" is calculated by evaluating its load hint across a subgraph of entities
 * & relations, load-ness can be true-then-false, as its subgraph changes.
 *
 * To avoid performance issues (see https://github.com/joist-orm/joist-orm/issues/1166),
 * we cache this dynamic/expensive `isLoaded` checks, and then do an extremely simplistic
 * cache invalidation whenever any relation is mutated.
 *
 * (It should be doable to leverage the reversed reactive hints to more targeted cache
 * invalidation, but this naive approach gets us the performance we need for now.)
 */
export interface IsLoadedCachable {
  entity: Entity;
  fieldName: string;
  isLoaded: boolean;
  resetIsLoaded(): void;
}

export class IsLoadedCache {
  private cache = new Set<IsLoadedCachable>();

  add(target: IsLoadedCachable): void {
    const meta = getMetadata(target.entity);
    const field = meta.allFields[target.fieldName];
    // console.log(field.kind);
    this.cache.add(target);
  }

  resetIsLoaded(): void {
    for (const target of this.cache.values()) {
      target.resetIsLoaded();
    }
    this.cache.clear();
  }
}

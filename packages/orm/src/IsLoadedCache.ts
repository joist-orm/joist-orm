import { Entity } from "./Entity";
import { getBaseAndSelfMetas, getMetadata } from "./EntityMetadata";

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
  // Cache of `{ tag -> { fieldName -> Set<IsLoadedCachable> } }`
  private cache: Record<string, Record<string, Set<IsLoadedCachable>>> = {};
  // private cache = new Set<IsLoadedCachable>();

  add(target: IsLoadedCachable): void {
    const meta = getMetadata(target.entity);
    const set = ((this.cache[meta.tagName] ??= {})[target.fieldName] ??= new Set());
    set.add(target);
    // this.cache.add(target);
  }

  resetIsLoaded(entity: Entity, fieldName: string): void {
    // for (const target of this.cache.values()) target.resetIsLoaded();
    // this.cache.clear();

    // This is the index of RFs that will be dirty
    const meta = getMetadata(entity);
    const rfs = getBaseAndSelfMetas(meta).flatMap((m) => m.config.__data.reactiveDerivedValues);
    for (const rf of rfs) {
      // I.e. we've written to Author.firstName, and this RF depends on it
      if (rf.fields.includes(fieldName)) {
        const otherMeta = getMetadata(rf.cstr);
        // Find any cache entries for this rf.cstr + rf.fieldName
        const set = this.cache[otherMeta.tagName]?.[rf.name];
        if (set) {
          for (const target of set) target.resetIsLoaded();
          set.clear();
        }
      }
    }

    // Invalid o2ms
    const field = meta.allFields[fieldName];
    if (field.kind === "m2o") {
      const otherMeta = field.otherMetadata();
      const set = this.cache[otherMeta.tagName]?.[field.otherFieldName];
      if (set) {
        for (const target of set) target.resetIsLoaded();
        set.clear();
      }
    }

    // How do we invalidate recursive parent & children?
  }
}

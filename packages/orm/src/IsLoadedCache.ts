import { Entity } from "./Entity";
import { getMetadata } from "./EntityMetadata";
import { getReactiveFields } from "./caches";

/**
 * Interface for our relations that have dynamic & expensive `isLoaded` checks.
 *
 * ...and also `OneToManyCollection.get` calls.
 *
 * The primary m2o/o2m/m2m relations all have trivial `isLoaded` checks--are they
 * loaded or not.
 *
 * But for "composite relations", i.e. a ReactiveField or ReactiveRelation whose
 * "load-ness" is calculated by evaluating its load hint across a subgraph of entities
 * & relations, load-ness can be more dynamic true-then-false, as its subgraph changes.
 *
 * To avoid performance issues (see https://github.com/joist-orm/joist-orm/issues/1166),
 * we cache this dynamic/expensive `isLoaded` checks, and then do targeted, reactivity-driven
 * cache invalidation whenever relations are mutated (via a hook in `setField`).
 */
export interface IsLoadedCachable {
  entity: Entity;
  fieldName: string;
  isLoaded: boolean;
  resetIsLoaded(): void;
}

export class IsLoadedCache {
  // Cache of `{ tag -> { fieldName -> Set<IsLoadedCachable> } }` for relations we
  // can intelligently/selectively invalidate.
  private smartCache: Record<string, Record<string, Set<IsLoadedCachable>>> = {};
  // A dumber cache for things that are harder to invalidate/not yet selective,
  // like o2m.get, recursive collections, and custom references/collections.
  private naiveCache = new Set<IsLoadedCachable>();

  add(target: IsLoadedCachable): void {
    const meta = getMetadata(target.entity);
    const set = ((this.smartCache[meta.tagName] ??= {})[target.fieldName] ??= new Set());
    set.add(target);
  }

  addNaive(target: IsLoadedCachable): void {
    this.naiveCache.add(target);
  }

  resetIsLoaded(entity: Entity, fieldName: string): void {
    // This is the index of RFs that will be dirty
    const meta = getMetadata(entity);
    const todo = [{ fieldName, rfs: getReactiveFields(meta) }];
    while (todo.length !== 0) {
      const { fieldName, rfs } = todo.pop()!;
      for (const rf of rfs) {
        // I.e. we've written to Author.firstName, and this RF depends on it
        if (rf.fields.includes(fieldName)) {
          const otherMeta = getMetadata(rf.cstr);
          // Find any cache entries for this rf.cstr + rf.fieldName
          const set = this.smartCache[otherMeta.tagName]?.[rf.name];
          if (set) {
            for (const target of set) {
              target.resetIsLoaded();
              // Is this target itself a RF/RR?
              // const field = getMetadata(target.entity).allFields[target.fieldName];
              // if ("derived" in field && field.derived) {
              //   todo.push({ fieldName: field.fieldName, rfs: getReactiveFields(otherMeta) });
              // }
            }
            set.clear();
          }
        }
      }
    }

    // We could use this to invalidate m2o.get, but it doesn't work for collections
    // with an orderBy, when the orderBy changes, so for now we use the blunt naiveCache.
    // const field = meta.allFields[fieldName];
    // if (field.kind === "m2o") {
    //   const otherMeta = field.otherMetadata();
    //   const set = this.smartCache[otherMeta.tagName]?.[field.otherFieldName];
    //   if (set) {
    //     for (const target of set) target.resetIsLoaded();
    //     set.clear();
    //   }
    // }

    for (const target of this.naiveCache.values()) target.resetIsLoaded();
    this.naiveCache.clear();
  }
}

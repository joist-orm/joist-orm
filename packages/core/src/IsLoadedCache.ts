import { Entity } from "./Entity";
import { EntityMetadata, getMetadata } from "./EntityMetadata";
import { getReactablesIncludingReadOnly } from "./caches";

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
  // Cache of `{ tag -> { fieldName -> Set<IsLoadedCachable> } }` to hold derived relations
  // we can selectively invalidate by walking from the mutated field to any downstream
  // cacheables.
  #smartCache: Record<string, Record<string, Set<IsLoadedCachable>>> = {};
  // A dumb cache for things that are hard selectively invalidate (o2m.get, recursive collections,
  // and custom references/collections), so any mutation resets these.
  #naiveCache = new Set<IsLoadedCachable>();
  // Counter to try and fast-path resetIsLoaded
  #dirtySets = 0;

  /** Adds a ReactiveField/Relation/Collection to be invalidated when its dependencies change. */
  add(target: IsLoadedCachable): void {
    const meta = getMetadata(target.entity);
    const set = ((this.#smartCache[meta.tagName] ??= {})[target.fieldName] ??= new Set());
    if (set.size === 0) this.#dirtySets++;
    set.add(target);
  }

  addNaive(target: IsLoadedCachable): void {
    if (this.#naiveCache.size === 0) this.#dirtySets++;
    this.#naiveCache.add(target);
  }

  /** Resets any isLoaded caches that depend on `entity.fieldName`. */
  resetIsLoaded(entity: Entity, fieldName: string): void {
    if (this.#dirtySets === 0) return;
    // Reset caches that we can deterministically find by walking the reactivity hints
    this.#resetDownstreamReactables(getMetadata(entity), fieldName);
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
    if (this.#naiveCache.size > 0) {
      for (const target of this.#naiveCache.values()) target.resetIsLoaded();
      this.#naiveCache.clear();
      this.#dirtySets--;
    }
  }

  #resetDownstreamReactables(meta: EntityMetadata, fieldName: string): void {
    // These are reactables in other entities that are watching/reacting to this entity/fieldName
    const reactables = getReactablesIncludingReadOnly(meta);
    for (const r of reactables) {
      // I.e. we've written to Author.firstName, and this reactable in Book/otherMeta depends on it
      if (r.fields.includes(fieldName)) {
        const otherMeta = getMetadata(r.cstr);
        // Find any cache entries for this cstr + name
        const set = this.#smartCache[otherMeta.tagName]?.[r.name];
        if (set?.size > 0) {
          for (const target of set) {
            target.resetIsLoaded();
            // Is this target itself a RF/RR? If so, transitively reset its cache as well.
            const otherMeta = getMetadata(target.entity);
            const otherField = otherMeta.allFields[target.fieldName];
            if ("derived" in otherField && otherField.derived) {
              this.#resetDownstreamReactables(otherMeta, otherField.fieldName);
            }
          }
          set.clear();
          this.#dirtySets--;
        }
      }
    }
  }
}

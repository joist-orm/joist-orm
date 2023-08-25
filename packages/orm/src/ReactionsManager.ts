import { ReactiveField } from "./config";
import { Entity } from "./Entity";
import { getAllMetas, getMetadata } from "./EntityMetadata";
import { followReverseHint } from "./reactiveHints";

/**
 * Manages the reactivity of tracking which source fields have changed and finding/recalculating
 * their downstream derived fields.
 *
 * Source fields are usually regular/dumb primitives, i.e. `Author.age` is a source field
 * of `Book.isPublic`, but derived fields can themselves be source fields as well.
 */
export class ReactionsManager {
  /** Stores all source `ReactiveField`s that have been marked for later traversal. */
  private pendingFieldReactions: Map<ReactiveField, Set<Entity>> = new Map();

  /**
   * Queue all downstream reactive fields that depend on `fieldName` as a source field.
   *
   * This method can be synchronous b/c we internally queue the `ReactiveField` reverse
   * indexes on the given source `fieldName`, and don't crawl/walk back to the downstream
   * entities/fields until `recalcPendingDerivedValues` is called.
   */
  queueDownstreamReactiveFields(entity: Entity, fieldName: string): void {
    // Use the reverse index of ReactiveFields that configureMetadata sets up
    const rfs = getAllMetas(getMetadata(entity)).flatMap((m) => m.config.__data.reactiveDerivedValues);
    for (const rf of rfs) {
      if (rf.fields.includes(fieldName)) {
        // We always queue the RF/entity, even if we're mid-flush or even mid-recalc, to avoid:
        // - firstName is changed from a1 to a2
        // - this triggers firstName's RF to `Author.initials` to be queued
        // - during the 1st em.flush loop, we recalc `Author.initials` and it didn't change
        // - during the 1st em.flush loop, a hook changes firstName from a2 to b2
        // - if we skip re-queuing firstName's RFs, we will miss that initials needs
        //   its `.load()` called again so that it's `setField` marks `initials` as
        //   dirty, otherwise it will be left out of any INSERTs/UPDATEs.
        this.getPending(rf).add(entity);
      }
    }
  }

  /** Dequeues reactivity on `fieldName`, i.e. if it's no longer dirty. */
  dequeueDownstreamReactiveFields(entity: Entity, fieldName: string): void {
    // Use the reverse index of ReactiveFields that configureMetadata sets up
    const rfs = getAllMetas(getMetadata(entity)).flatMap((m) => m.config.__data.reactiveDerivedValues);
    for (const rf of rfs) {
      if (rf.fields.includes(fieldName)) {
        const pending = this.getPending(rf);
        // We can only delete/dequeue a reaction if `fieldName` is the only or last field
        // that had triggered `rf` to run. Since we don't track that currently, i.e. we'd
        // need to have a `Pending.dirtyFields`, for now just only dequeue if `rf` only
        // has one field (which is us) anyway.
        if (rf.fields.length === 1) {
          pending.delete(entity);
        }
      }
    }
  }

  /** Queue all downstream reactive fields that depend on this entity being created or deleted. */
  queueAllDownstreamFields(entity: Entity): void {
    const rfs = getAllMetas(getMetadata(entity)).flatMap((m) => m.config.__data.reactiveDerivedValues);
    for (const rf of rfs) {
      this.getPending(rf).add(entity);
    }
  }

  /**
   * Given source `ReactiveField` "reverse indexes" that have been queued as dirty by calls
   * to setters, `em.register`, or `em.delete`, asynchronously walks/crawls to the downstream
   * derived fields and calls `.load()` on them to calc.
   *
   * We also do this in a loop to handle reactive fields depending on other reactive fields.
   */
  async recalcPendingDerivedValues() {
    let scanPending = true;
    let loops = 0;
    while (scanPending) {
      scanPending = false;
      const relations = await Promise.all(
        [...this.pendingFieldReactions.entries()].map(async ([rf, pending]) => {
          // Copy pending and clear it
          const todo = [...pending];
          pending.clear();
          // If we found any pending, loop again b/c we might be a dependency of another field,
          // which our `.load()` will have marked as pending by calling `queueDownstreamReactiveFields`.
          if (todo.length > 0) {
            scanPending = true;
          }
          // Walk back from the source to any downstream fields
          return (await followReverseHint(todo, rf.path))
            .filter((entity) => !entity.isDeletedEntity)
            .filter((e) => e instanceof rf.cstr)
            .map((entity) => (entity as any)[rf.name]);
        }),
      );
      // Multiple reactions could have pointed back to the same reactive field, so
      // dedupe the found relations before calling .load.
      const unique = new Set(relations.flat());
      await Promise.all([...unique].map((r: any) => r.load()));
      // This should generally not happen, only if two reactive fields depend on each other,
      // which in theory should probably be caught/blow up in the `configureMetadata` step,
      // but if it's not caught sooner, at least don't infinite loop.
      if (loops++ > 50) {
        throw new Error("recalc looped too many times, probably a circular dependency");
      }
    }
  }

  /** Clears all the pending source fields, i.e. after `em.flush` is complete. */
  clear(): void {
    this.pendingFieldReactions = new Map();
  }

  private getPending(rf: ReactiveField): Set<Entity> {
    let pending = this.pendingFieldReactions.get(rf);
    if (!pending) {
      pending = new Set();
      this.pendingFieldReactions.set(rf, pending);
    }
    return pending;
  }
}

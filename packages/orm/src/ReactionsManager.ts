import { ReactiveField } from "./config";
import { Entity } from "./Entity";
import { getAllMetas, getMetadata } from "./EntityMetadata";
import { followReverseHint } from "./reactiveHints";

type Pending = { todo: Set<Entity>; done: Set<Entity> };

/**
 * Manages the reactivity of tracking which source fields have changed and finding/recalculating
 * their downstream derived fields.
 *
 * Source fields are usually regular/dumb primitives, i.e. `Author.age` is a source field
 * of `Book.isPublic`, but derived fields can themselves be source fields as well.
 */
export class ReactionsManager {
  /** Stores all source `ReactiveField`s that have been marked for later traversal. */
  private pendingFieldReactions: Map<ReactiveField, Pending> = new Map();

  /**
   * Queue all downstream reactive fields that depend on `fieldName` as a source field.
   *
   * This method can be synchronous b/c we just internally queue the `ReactiveField` reverse
   * indexes on the given source `fieldName`, and don't crawl/walk back to the actual downstream
   * entities/fields until `recalcPendingDerivedValues` is called.
   */
  queueDownstreamReactiveFields(entity: Entity, fieldName: string): void {
    // Use the reverse index of ReactiveFields that configureMetadata sets up
    const rfs = getAllMetas(getMetadata(entity)).flatMap((m) => m.config.__data.reactiveDerivedValues);
    for (const rf of rfs) {
      if (rf.fields.includes(fieldName)) {
        const pending = this.getPending(rf);
        if (!pending.done.has(entity)) {
          pending.todo.add(entity);
        }
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
        pending.todo.delete(entity);
      }
    }
  }

  /** Queue all downstream reactive fields that depend on this entity being created or deleted. */
  queueAllDownstreamFields(entity: Entity): void {
    const rfs = getAllMetas(getMetadata(entity)).flatMap((m) => m.config.__data.reactiveDerivedValues);
    for (const rf of rfs) {
      const pending = this.getPending(rf);
      if (!pending.done.has(entity)) {
        pending.todo.add(entity);
      }
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
    while (scanPending) {
      scanPending = false;
      const relations = await Promise.all(
        [...this.pendingFieldReactions.entries()].map(async ([rf, pending]) => {
          // Copy todo and clear it
          const todo = [...pending.todo];
          pending.todo.clear();
          for (const entity of todo) pending.done.add(entity);
          // If we found any pending, loop again b/c we might be a dependency of another field,
          // which our `.load()` will have marked as pending by calling `queueDownstreamReactiveFields`.
          if (todo.length > 0) {
            scanPending = true;
          }
          // Walk back from the source to any downstream fields
          return (await followReverseHint(todo, rf.path))
            .map((e) => {
              console.log(`Reacting for ${rf.name} and found ${e} ${e.isDeletedEntity}`);
              return e;
            })
            .filter((entity) => !entity.isDeletedEntity)
            .filter((e) => e instanceof rf.cstr)
            .map((entity) => (entity as any)[rf.name]);
        }),
      );
      await Promise.all(relations.flat().map((r: any) => r.load()));
    }
  }

  /** Clears all the pending source fields, i.e. after `em.flush` is complete. */
  clear(): void {
    this.pendingFieldReactions = new Map();
  }

  private getPending(rf: ReactiveField): Pending {
    let pending = this.pendingFieldReactions.get(rf);
    if (!pending) {
      pending = { todo: new Set(), done: new Set() };
      this.pendingFieldReactions.set(rf, pending);
    }
    return pending;
  }
}

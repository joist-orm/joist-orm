import { Entity } from "./Entity";
import { EntityMetadata, getMetadata } from "./EntityMetadata";
import { getReactables, getReactablesIncludingReadOnly } from "./caches";
import { Reactable } from "./config";
import { EntityManager, getEmInternalApi, NoIdError } from "./index";
import { globalLogger, ReactionLogger } from "./logging/ReactionLogger";
import { followReverseHint } from "./reactiveHints";

export type ReactiveAction = { key: string; r: Reactable; entity: Entity };
/**
 * Manages the reactivity of tracking which source fields have changed and finding/recalculating
 * their downstream derived fields.
 *
 * Source fields are usually regular/dumb primitives, i.e. `Author.age` is a source field
 * of `Book.isPublic`, but derived fields can themselves be source fields as well.
 */
export class ReactionsManager {
  /** Stores all source `Reactables`s that have been marked for later traversal. */
  private pendingReactables: Map<Reactable, { todo: Set<Entity>; done: Set<Entity> }> = new Map();
  /**
   * A map of entity tagName -> fields that have been marked as dirty.
   *
   * The key of the map is "just" the tag name, instead of a specific entity, b/c at the time of
   * being marked dirty, we only have the upstream/source entity + fieldName that has changed, and
   * not the 1-or-more downstream/target entities that will actually recalc.
   *
   * Instead, we just track the dirty fields by type-of-entity, which is enough for `isPendingRecalc`.
   */
  private dirtyFields: Map<string, Set<string>> = new Map();
  /**
   * Derived fields we tried to calculate, but they failed with `NoIdError`s, so we'll
   * try again during `em.flush`.
   */
  private actionsPendingAssignedIds: Map<string, ReactiveAction> = new Map();
  private processedActions: Set<string> = new Set();
  private needsRecalc = { populate: false, query: false, reaction: false };
  private logger: ReactionLogger | undefined = globalLogger;
  private em: EntityManager;
  /** These are NPEs that *might* have been from invalid m2o fields, so we only throw them after validation. */
  private suppressedTypeErrors: Error[] = [];

  constructor(em: EntityManager) {
    this.em = em;
  }

  /**
   * Queue all downstream reactive fields that depend on `fieldName` as a source field.
   *
   * This method can be synchronous b/c we internally queue the `Reactable` reverse
   * indexes on the given source `fieldName`, and don't crawl/walk back to the downstream
   * entities/fields until `recalcPendingReactables` is called.
   */
  queueDownstreamReactables(entity: Entity, fieldName: string): void {
    // Use the reverse index of Reactables that configureMetadata sets up
    for (const r of this.getReactables(entity)) {
      if (r.fields.includes(fieldName)) {
        // We always queue the reactable/entity, even if we're mid-flush or even mid-recalc, to avoid:
        // - firstName is changed from a1 to a2
        // - this triggers firstName's reactable to `Author.initials` to be queued
        // - during the 1st em.flush loop, we recalc `Author.initials` and it didn't change
        // - during the 1st em.flush loop, a hook changes firstName from a2 to b2
        // - if we skip re-queuing firstName's reactables, we will miss that initials needs
        //   its `.load()` called again so that it's `setField` marks `initials` as
        //   dirty, otherwise it will be left out of any INSERTs/UPDATEs.
        this.getPending(r).todo.add(entity);
        this.getDirtyFields(getMetadata(r.cstr)).add(r.name);
        this.needsRecalc[r.kind] = true;
        this.logger?.logQueued(entity, fieldName, r);
      }
    }
  }

  /** Dequeues reactivity on `fieldName`, i.e. if it's no longer dirty. */
  dequeueDownstreamReactables(entity: Entity, fieldName: string): void {
    // Use the reverse index of Reactables that configureMetadata sets up
    for (const r of this.getReactables(entity)) {
      if (r.fields.includes(fieldName)) {
        const pending = this.getPending(r);
        if (pending.done.has(entity)) {
          // Ironically, if we've already run this reactable, asking to dequeue probably means
          // we need to run it again (to recalc its value), b/c this could be a mid-flush change, i.e.:
          // - firstName = a1 from db
          // - firstName is changed to a2, triggers initials reactable
          // - firstName is changed back to a1, which is the original value, so setField
          //   thinks we can dequeue the reactable
          // - but actually our reactable needs to be re-run with the restored value
          pending.todo.add(entity);
        } else if (r.fields.length === 1) {
          // We can only delete/dequeue a reaction if `fieldName` is the only or last field
          // that had triggered `r` to run. Since we don't track that currently, i.e. we'd
          // need to have a `Pending.dirtyFields`, for now just only dequeue if `r` only
          // has one field (which is us) anyway.
          pending.todo.delete(entity);
        }
      }
    }
  }

  /** Queue all downstream reactive fields that depend on this entity being created or deleted. */
  queueAllDownstreamFields(entity: Entity, reason: "created" | "deleted"): void {
    for (const r of this.getReactables(entity)) {
      this.getPending(r).todo.add(entity);
      this.getDirtyFields(getMetadata(r.cstr)).add(r.name);
      this.needsRecalc[r.kind] = true;
      this.logger?.logQueuedAll(entity, reason, r);
    }
  }

  /**
   * Returns whether this field might be pending recalc.
   *
   * This is technically a guess, b/c our reaction infra may not yet have crawled from an upstream
   * source field down to the `N` specific target entities that need recalced, and instead just
   * knows "it will need to do that soon" i.e. at the next `em.flush`.
   *
   * So, instead this is a heuristic that reports if `fieldName` has been marked dirty for _some_
   * entities of type `entity`, but we don't technically know if that's _this_ entity.
   *
   * I.e. this might return false positives, but should never return false negatives.
   */
  isMaybePendingRecalc(entity: Entity, fieldName: string): boolean {
    return this.getDirtyFields(getMetadata(entity)).has(fieldName);
  }

  hasPendingReactiveQueries(): boolean {
    return this.needsRecalc.query;
  }

  /**
   * Given source `Reactable` "reverse indexes" that have been queued as dirty by calls
   * to setters, `em.register`, or `em.delete`, asynchronously walks/crawls to the downstream
   * derived fields and calls `.load()` on them to calc.
   *
   * We also do this in a loop to handle reactive fields depending on other reactive fields.
   */
  async recalcPendingReactables(kind: "reactables" | "reactiveQueries") {
    if (this.#needsRecalc(kind)) this.logger?.logStartingRecalc(this.em, kind);

    let loops = 0;
    while (this.#needsRecalc(kind)) {
      // ...we probably should only loop for `kind=reactables` Reactables, and `kind=reactiveQueries`
      // ReactiveQueryFields should probably only have a single loop, after which we return and
      // let `em.flush` push the latest values to the db, so our 2nd-order ReactiveQueryFields
      // will see the latest value.
      if (kind === "reactables") {
        this.needsRecalc.populate = false;
        this.needsRecalc.reaction = false;
      } else {
        this.needsRecalc.query = false;
      }

      const actionsMap: Map<string, ReactiveAction> = new Map();

      await Promise.all(
        [...this.pendingReactables.entries()].map(async ([r, pending]) => {
          // Skip reactive queries until post-flush
          if (kind === "reactables" && r.kind === "query") return [];
          if (kind === "reactiveQueries" && (r.kind === "populate" || r.kind === "reaction")) return [];
          // Copy pending and clear it
          const todo = [...pending.todo];
          if (todo.length === 0) return [];
          pending.todo.clear();
          for (const doing of todo) pending.done.add(doing);
          // Walk back from the source to any downstream entities
          const entities = (await followReverseHint(r.name, todo, r.path))
            .filter((entity) => !entity.isDeletedEntity)
            .filter((e) => e instanceof r.cstr);
          this.logger?.logWalked(todo, r, entities);
          entities.forEach((entity) => {
            const key = `${entity}_${r.name}`;
            // We could arrive at the same reactable from multiple paths (eg, 2 dependent fields changed), so we need to
            // dedupe based on the entity and reactable to only run each action once for any given entity per loop
            if (actionsMap.has(key)) return;
            // If this reactable has already run and shouldn't run again, then skip it
            if (r.runOnce && this.processedActions.has(key)) return;
            actionsMap.set(key, { key, r, entity });
          });
        }),
      );

      const actions = [...actionsMap.values()];
      this.logger?.logLoading(this.em, actions);
      // Use allSettled so that we can watch for derived values that want to use an entity's id
      // i.e. they can fail, but we'll queue them from later.
      const startTime = this.logger?.now() ?? 0;
      const results = await Promise.allSettled(actions.map((a) => this.#doAction(a)));
      const endTime = this.logger?.now() ?? 0;
      this.logger?.logLoadingTime(this.em, endTime - startTime);

      const failures: any[] = [];
      results.forEach((result, i) => {
        if (result.status === "rejected") {
          // Let `author.id` and `book.author.get.firstName` errors run again after flush/hooks fills them in
          if (result.reason instanceof NoIdError || result.reason instanceof TypeError) {
            const action = actions[i];
            this.actionsPendingAssignedIds.set(action.key, action);
          } else {
            failures.push(result.reason);
          }
        }
      });
      if (failures.length > 0) throw failures[0];
      // Record any succesful actions that should only run once so we don't run them again
      actions.forEach(({ key, r }) => {
        if (r.runOnce) this.processedActions.add(key);
      });

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
    this.pendingReactables = new Map();
    this.processedActions.clear();
  }

  get hasFieldsPendingAssignedIds(): boolean {
    return this.actionsPendingAssignedIds.size > 0;
  }

  async recalcRelationsPendingAssignedIds(): Promise<void> {
    const actions = [...this.actionsPendingAssignedIds.values()];
    this.actionsPendingAssignedIds.clear();

    const startTime = this.logger?.now() ?? 0;
    const results = await Promise.allSettled(
      actions.filter((a) => !a.entity.isDeletedEntity).map((a) => this.#doAction(a)),
    );
    const endTime = this.logger?.now() ?? 0;
    this.logger?.logLoadingTime(this.em, endTime - startTime);

    const failures: any[] = [];
    results.forEach((result) => {
      if (result.status === "rejected") {
        if (result.reason instanceof TypeError) {
          // Defer to the validation error to catch this
          this.suppressedTypeErrors.push(result.reason);
        } else {
          failures.push(result.reason);
        }
      }
    });
    if (failures.length > 0) throw failures[0];
  }

  setLogger(logger: ReactionLogger | undefined): void {
    this.logger = logger;
  }

  clearSuppressedTypeErrors(): void {
    this.suppressedTypeErrors = [];
  }

  throwIfAnySuppressedTypeErrors(): void {
    if (this.suppressedTypeErrors.length > 0) {
      throw this.suppressedTypeErrors[0];
    }
  }

  #doAction(action: ReactiveAction) {
    const { r, entity } = action;
    return r.kind === "reaction" ? r.fn(entity, this.em.ctx) : (entity as any)[r.name].load();
  }

  #needsRecalc(kind: "reactables" | "reactiveQueries"): boolean {
    return kind === "reactables" ? this.needsRecalc.populate || this.needsRecalc.reaction : this.needsRecalc.query;
  }

  private getPending(r: Reactable): { todo: Set<Entity>; done: Set<Entity> } {
    let pending = this.pendingReactables.get(r);
    if (!pending) {
      pending = { todo: new Set(), done: new Set() };
      this.pendingReactables.set(r, pending);
    }
    return pending;
  }

  private getDirtyFields(meta: EntityMetadata): Set<string> {
    let dirty = this.dirtyFields.get(meta.tagName);
    if (!dirty) {
      dirty = new Set();
      this.dirtyFields.set(meta.tagName, dirty);
    }
    return dirty;
  }

  private getReactables(entity: Entity): Reactable[] {
    // If two books are getting merged, and so a normally-immutable `BookReview.book` is being changed,
    // then even normally-immutable fields need to be recalculated.
    return getEmInternalApi(this.em).isMerging(entity)
      ? getReactablesIncludingReadOnly(getMetadata(entity))
      : getReactables(getMetadata(entity));
  }
}

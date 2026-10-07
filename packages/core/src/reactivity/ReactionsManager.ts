import type { Reactable } from "src/config.ts";
import type { Entity } from "src/Entity.ts";
import { type EntityManager, getEmInternalApi, invokeRule } from "src/EntityManager.ts";
import { type EntityMetadata, getMetadata } from "src/EntityMetadata.ts";
import { NoIdError } from "src/index.ts";
import { type ReactionLogger, globalLogger, noopReactionLogger } from "src/logging/ReactionLogger.ts";
import { followReverseHint } from "src/reactivity/reactiveHints.ts";
import { type ValidationError, ValidationErrors } from "src/rules.ts";
import {
  type TransitionCallback,
  type TransitionStep,
  created,
  describeValue,
  matchesTransition,
} from "src/transitions.ts";
import { runInTrustedContext } from "src/trusted.ts";
import { failIfAnyRejected } from "src/utils.ts";

export type ReactiveAction = { r: Reactable; entity: Entity };
/**
 * Manages the reactivity of tracking which source fields have changed and finding/recalculating
 * their downstream derived fields.
 *
 * Source fields are usually regular/dumb primitives, i.e. `Author.age` is a source field
 * of `Book.isPublic`, but derived fields can themselves be source fields as well.
 * Guarded state transitions share this loop; their commit callbacks wait until SQL has been flushed.
 */
export class ReactionsManager {
  /** Stores all source `Reactables`s that have been marked for later traversal. */
  private pendingReactables: Map<Reactable, { todo: Set<Entity>; done: Set<Entity> }> = new Map();
  /** Queued state changes, including changes made by callbacks, are processed in reaction passes. */
  private pendingTransitions: PendingTransition[] = [];
  /** Initial assignments are collapsed until reactions first see the entity. */
  private transitionCreations: Map<Entity, Map<string, TransitionStep>> = new Map();
  /** New entities that reactions have seen, so their assignments are transitions. */
  private postCreationWindowEntities: Set<Entity> = new Set();
  /** Only matching callbacks are retained until SQL and final validation finish. */
  private pendingCommitTransitions: PendingCommitCallback[] = [];
  /** Failed actions to retry post-hooks, deduped by target field name -> entity (rare error path). */
  private actionsPendingTypeErrors: Map<string, Map<Entity, ReactiveAction>> = new Map();
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
   * Tracks which entities have already run a `runOnce` reactable, keyed by the target field
   * name -> entities. We key on `r.name` (not `r` itself) b/c two `Reactable`s reverse-indexed
   * from different source paths can target the same derived field, and must dedupe together.
   * Keying the outer map by field name (of which there are few) instead of by entity (of which
   * there are many) means we allocate just one `Set` per distinct field name, rather than a
   * `Set` per entity or the old per-action `${entity.toTaggedString()}_${r.name}` key strings.
   */
  private processedActions: Map<string, Set<Entity>> = new Map();
  #needsRecalc = { populate: false, query: false, reaction: false };
  // Accessible for EntityManager.runValidation to reuse
  logger: ReactionLogger = globalLogger ?? noopReactionLogger;
  private em: EntityManager;
  /** These are NPEs that *might* have been from invalid m2o fields, so we only throw them after validation. */
  private suppressedTypeErrors: Error[] = [];

  constructor(em: EntityManager) {
    this.em = em;
  }

  /**
   * Called by `setField` before changing an enum field, to check and queue the transition.
   *
   * An entity has no previous state until Joist's reactions have seen it, so every assignment to a new
   * entity until then is part of its creation. I.e. `em.create` then `entity.status = Open`, or a factory
   * setting a default and then a `withStatus` value, or `em.findOrCreate` creating then upserting, all
   * create the entity as `Open`. Creation isn't checked against the `transitions` table.
   */
  queueTransition(entity: Entity, fieldName: string, from: unknown, to: unknown): void {
    const meta = getMetadata(entity);
    const transitions = meta.transitions!.get(fieldName);
    if (!transitions) return;
    // If this is a new entity still within its creation window, only keep the last step
    if (entity.isNewEntity && !this.postCreationWindowEntities.has(entity)) {
      let byField = this.transitionCreations.get(entity);
      if (!byField) this.transitionCreations.set(entity, (byField = new Map()));
      byField.set(fieldName, { from: created, to });
    } else {
      // Base and subtype tables are all checked, so each type can only restrict its base type's changes
      for (const table of transitions.tables) {
        if (table.get(from)?.includes(to)) continue;
        const message = `Cannot change ${fieldName} from ${describeValue(meta, fieldName, from)} to ${describeValue(meta, fieldName, to)}`;
        throw new ValidationErrors([{ entity, message }]);
      }
      this.pendingTransitions.push({ entity, fieldName, step: { from, to } });
    }
  }

  /** Forgets a field's creation transition after a factory assigns its trusted initial value. */
  forgetCreationTransition(entity: Entity, fieldName: string): void {
    this.transitionCreations.get(entity)?.delete(fieldName);
  }

  /** Returns whether callbacks need a commit phase, even if there are no net SQL changes. */
  hasPendingCommitTransitions(): boolean {
    return this.pendingCommitTransitions.some((pending) => !pending.entity.isDeletedEntity);
  }

  /** Runs the queued callbacks after all SQL and validation succeed, without rechecking guards. */
  async runCommitTransitions(): Promise<void> {
    const batch = this.pendingCommitTransitions.splice(0);
    for (const wave of groupIntoEntityWaves(batch)) {
      const results = await Promise.allSettled(
        wave.map(async (pending) => {
          if (!pending.entity.isDeletedEntity) {
            await pending.callback.run(pending.entity, this.em.ctx, pending.step);
          }
        }),
      );
      failIfAnyRejected(results);
    }
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
    for (const r of this.getReactablesByField(entity, fieldName)) {
      // We always queue the reactable/entity, even if we're mid-flush or even mid-recalc, to avoid:
      // - firstName is changed from a1 to a2
      // - this triggers firstName's reactable to `Author.initials` to be queued
      // - during the 1st em.flush loop, we recalc `Author.initials` and it didn't change
      // - during the 1st em.flush loop, a hook changes firstName from a2 to b2
      // - if we skip re-queuing firstName's reactables, we will miss that initials needs
      //   its `.load()` called again so that it's `setField` marks `initials` as
      //   dirty, otherwise it will be left out of any INSERTs/UPDATEs.
      this.getPending(r).todo.add(entity);
      this.#needsRecalc[r.kind] = true;
      this.logger.logQueued(entity, fieldName, r);
    }
  }

  /** Dequeues reactivity on `fieldName`, i.e. if it's no longer dirty. */
  dequeueDownstreamReactables(entity: Entity, fieldName: string): void {
    // Use the reverse index of Reactables that configureMetadata sets up
    for (const r of this.getReactablesByField(entity, fieldName)) {
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
        this.#needsRecalc[r.kind] = true;
      } else if (r.fields.length === 1) {
        // We can only delete/dequeue a reaction if `fieldName` is the only or last field
        // that had triggered `r` to run. Since we don't track that currently, i.e. we'd
        // need to have a `Pending.dirtyFields`, for now just only dequeue if `r` only
        // has one field (which is us) anyway.
        pending.todo.delete(entity);
      }
    }
  }

  /** Queue all downstream reactive fields that depend on this entity being created or deleted. */
  queueAllDownstreamFields(entity: Entity, reason: "created" | "deleted"): void {
    for (const r of this.getReactables(entity)) {
      this.getPending(r).todo.add(entity);
      this.#needsRecalc[r.kind] = true;
      this.logger.logQueuedAll(entity, reason, r);
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
    return this.#needsRecalc.query;
  }

  /**
   * Given source `Reactable` "reverse indexes" that have been queued as dirty by calls
   * to setters, `em.register`, or `em.delete`, asynchronously walks/crawls to the downstream
   * derived fields and calls `.load()` on them to calc.
   *
   * We also do this in a loop to handle reactive fields depending on other reactive fields.
   */
  async recalcPendingReactables(kind: "reactables" | "reactiveQueries") {
    if (this.needsRecalc(kind)) this.logger.logStartingRecalc(this.em, kind);

    let loops = 0;
    while (this.needsRecalc(kind)) {
      // Reactions are about to see every new entity so far, so later assignments to them are transitions
      this.endTransitionCreations();
      // ...we probably should only loop for `kind=reactables` Reactables, and `kind=reactiveQueries`
      // AsyncReactiveFields should probably only have a single loop, after which we return and
      // let `em.flush` push the latest values to the db, so our 2nd-order AsyncReactiveFields
      // will see the latest value.
      if (kind === "reactables") {
        this.#needsRecalc.populate = false;
        this.#needsRecalc.reaction = false;
      } else {
        this.#needsRecalc.query = false;
      }

      // Dedupe actions by (target field name, entity); see the `processedActions` docs for why
      // we key on `r.name` instead of `r` or the old per-action key strings
      const seen: Map<string, Set<Entity>> = new Map();
      const actions: ReactiveAction[] = [];

      const walks = await Promise.all(
        [...this.pendingReactables.entries()].map(async ([r, pending]) => {
          // Skip reactive queries until post-flush
          if (kind === "reactables" && r.kind === "query") return undefined;
          if (kind === "reactiveQueries" && (r.kind === "populate" || r.kind === "reaction")) return undefined;
          // Copy pending and clear it
          const todo = [...pending.todo];
          if (todo.length === 0) return undefined;
          pending.todo.clear();
          for (const doing of todo) pending.done.add(doing);
          // Walk back from the source to any downstream entities
          const entities = r.path.length === 0 ? todo : await followReverseHint(r.name, todo, r.path);
          const actionableEntities = entities.filter((entity) => !entity.isDeletedEntity && entity instanceof r.cstr);
          let seenEntities = seen.get(r.name);
          if (!seenEntities) seen.set(r.name, (seenEntities = new Set()));
          const processed = r.runOnce ? this.processedActions.get(r.name) : undefined;
          for (const entity of actionableEntities) {
            // We could arrive at the same reactable from multiple paths (eg, 2 dependent fields changed), so we need to
            // dedupe based on the entity and reactable to only run each action once for any given entity per loop
            if (seenEntities.has(entity)) continue;
            // If this reactable has already run and shouldn't run again, then skip it
            if (processed && processed.has(entity)) continue;
            seenEntities.add(entity);
            actions.push({ r, entity });
          }
          return { r, todo, entities: actionableEntities };
        }),
      );
      this.logger.logWalks(walks, "recalc");
      this.logger.logLoadingStart(this.em, actions);
      // Use allSettled so that we can watch for derived values that want to use an entity's id
      // i.e. they can fail, but we'll queue them from later.
      const startTime = this.logger.now();
      const results = await runInTrustedContext(() => Promise.allSettled(actions.map((a) => this.#doAction(a))));
      const endTime = this.logger.now();
      this.logger.logLoadingEnd(this.em, endTime - startTime);

      // This loop's actions are already unique by (name, entity), so a plain array dedupes fine
      const actionsPendingAssignedIds: ReactiveAction[] = [];
      const failures: any[] = [];
      results.forEach((result, i) => {
        if (result.status === "rejected") {
          // Let `author.id` and `book.author.get.firstName` errors run again after flush/hooks fills them in
          if (result.reason instanceof NoIdError) {
            actionsPendingAssignedIds.push(actions[i]);
          } else if (result.reason instanceof TypeError) {
            this.addPendingTypeError(actions[i]);
          } else {
            failures.push(result.reason);
          }
        }
      });

      // If we have any actions that need to be re-run because they failed due to a missing id, then we assign ids and
      // re-run them.
      if (actionsPendingAssignedIds.length > 0) {
        await this.em.assignNewIds();
        this.logger.logLoadingStart(this.em, actionsPendingAssignedIds);
        const startTime = this.logger.now();
        const results = await runInTrustedContext(() =>
          Promise.allSettled(actionsPendingAssignedIds.map((a) => this.#doAction(a))),
        );
        const endTime = this.logger.now();
        this.logger.logLoadingEnd(this.em, endTime - startTime);
        results.forEach((result, i) => {
          if (result.status === "rejected") {
            if (result.reason instanceof TypeError) {
              this.addPendingTypeError(actionsPendingAssignedIds[i]);
            } else {
              failures.push(result.reason);
            }
          }
        });
      }

      if (failures.length > 0) throw failures[0];
      if (kind === "reactables") {
        await runInTrustedContext(() => this.processPendingTransitions());
      }
      // Record any successful actions that should only run once so we don't run them again
      for (const action of actions) {
        if (action.r.runOnce) {
          let set = this.processedActions.get(action.r.name);
          if (!set) this.processedActions.set(action.r.name, (set = new Set()));
          set.add(action.entity);
        }
      }
      // This should generally not happen, only if two reactive fields depend on each other,
      // which in theory should probably be caught/blow up in the `configureMetadata` step,
      // but if it's not caught sooner, at least don't infinite loop.
      if (loops++ > 50) {
        throw new Error("recalc looped too many times, probably a circular dependency");
      }
    }
  }

  async recalcPendingTypeErrors() {
    const actions: ReactiveAction[] = [];
    for (const byEntity of this.actionsPendingTypeErrors.values()) {
      for (const action of byEntity.values()) actions.push(action);
    }
    this.actionsPendingTypeErrors.clear();

    const startTime = this.logger.now();
    const results = await runInTrustedContext(() =>
      Promise.allSettled(actions.filter((a) => !a.entity.isDeletedEntity).map((a) => this.#doAction(a))),
    );
    const endTime = this.logger.now();
    this.logger.logLoadingEnd(this.em, endTime - startTime);

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

  get hasPendingTypeErrors(): boolean {
    return this.actionsPendingTypeErrors.size > 0;
  }

  /** Clears pending reaction and transition work after a successful flush, including flushes with no SQL. */
  clear(): void {
    this.pendingReactables = new Map();
    this.processedActions.clear();
    this.pendingTransitions.length = 0;
    this.transitionCreations.clear();
    this.postCreationWindowEntities.clear();
    this.pendingCommitTransitions.length = 0;
    this.#needsRecalc = { populate: false, query: false, reaction: false };
  }

  setLogger(logger: ReactionLogger | undefined): void {
    this.logger = logger ?? noopReactionLogger;
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

  /** Remembers a TypeError'd action to retry post-hooks, deduped by (target field name, entity). */
  private addPendingTypeError(action: ReactiveAction): void {
    let byEntity = this.actionsPendingTypeErrors.get(action.r.name);
    if (!byEntity) this.actionsPendingTypeErrors.set(action.r.name, (byEntity = new Map()));
    byEntity.set(action.entity, action);
  }

  needsRecalc(kind: "reactables" | "reactiveQueries"): boolean {
    return kind === "reactables"
      ? this.#needsRecalc.populate ||
          this.#needsRecalc.reaction ||
          this.pendingTransitions.length > 0 ||
          this.transitionCreations.size > 0
      : this.#needsRecalc.query;
  }

  /**
   * Ends the creation of every new entity so far, before each loop of reactions.
   *
   * After this, assignments to those entities are transitions, i.e. an Approval created as `Requested`
   * that a reaction then auto-approves records `Requested -> Approved`.
   */
  private endTransitionCreations(): void {
    for (const [entity, byField] of this.transitionCreations) {
      this.postCreationWindowEntities.add(entity);
      for (const [fieldName, step] of byField) this.pendingTransitions.push({ entity, fieldName, step });
    }
    this.transitionCreations.clear();
  }

  /**
   * Evaluates each pending transition's guards once, then dispatches its matching callbacks.
   *
   * I.e. Pending -> Signed -> Pending restores an advance's original status, but the Signed guard must still run.
   * Callbacks can append more transitions; taking one batch leaves those for the next reaction pass.
   * Each wave processes one step per entity, so populate requests batch across entities without
   * allowing an entity's next transition to overtake its previous callbacks.
   *
   * We might eventually treat A -> B -> A as an undo and ignore both transitions before reactions
   * have seen them. For now, each transition is meaningful, even when the final state is unchanged.
   */
  private async processPendingTransitions(): Promise<void> {
    // Ordinary reactions may have created more entities during this pass.
    this.endTransitionCreations();
    if (this.pendingTransitions.length === 0) return;
    const batch = this.pendingTransitions.splice(0);
    for (const wave of groupIntoEntityWaves(batch)) {
      const guardResults = await Promise.allSettled(wave.map((pending) => this.evaluateTransitionGuards(pending)));
      const errors = failIfAnyRejected(guardResults).flat();
      if (errors.length > 0) throw new ValidationErrors(errors);
      const callbackResults = await Promise.allSettled(wave.map((pending) => this.runTransitionCallbacks(pending)));
      failIfAnyRejected(callbackResults);
    }
  }

  /** Evaluates one transition's matching guards before any callbacks in its wave run. */
  private async evaluateTransitionGuards(pending: PendingTransition): Promise<ValidationError[]> {
    const { entity, fieldName, step } = pending;
    if (entity.isDeletedEntity || step.from === created) return [];
    const guards = getMetadata(entity)
      .transitions!.get(fieldName)!
      .guards.filter((guard) => matchesTransition(guard.matcher, step));
    const results = await Promise.allSettled(guards.map((guard) => invokeRule(entity, () => guard.run(entity, step))));
    return failIfAnyRejected(results).flat();
  }

  /** Runs one entity's callbacks in registration order after all guards in the wave have passed. */
  private async runTransitionCallbacks(pending: PendingTransition): Promise<void> {
    const { entity, fieldName, step } = pending;
    if (entity.isDeletedEntity) return;
    for (const callback of getMetadata(entity).transitions!.get(fieldName)!.callbacks) {
      if (entity.isDeletedEntity) break;
      if (!matchesTransition(callback.matcher, step)) continue;
      if (callback.phase === "commit") {
        this.pendingCommitTransitions.push({ entity, callback, step });
      } else {
        await this.runTransitionCallback(entity, callback, step);
      }
    }
  }

  /** Assigns ids if a creation callback needs them, as ordinary reactions do. */
  private async runTransitionCallback(
    entity: Entity,
    callback: TransitionCallback,
    step: TransitionStep,
  ): Promise<void> {
    try {
      await callback.run(entity, this.em.ctx, step);
    } catch (error) {
      if (!(error instanceof NoIdError)) throw error;
      await this.em.assignNewIds();
      await callback.run(entity, this.em.ctx, step);
    }
  }

  private getPending(r: Reactable): { todo: Set<Entity>; done: Set<Entity> } {
    let pending = this.pendingReactables.get(r);
    if (!pending) {
      pending = { todo: new Set(), done: new Set() };
      this.pendingReactables.set(r, pending);
      // The dirty field name is constant per reactable, so mark it once on the first
      // queue instead of paying the `getMetadata` + map lookup on every queued entity.
      this.getDirtyFields(getMetadata(r.cstr)).add(r.name);
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
    const meta = getMetadata(entity);
    return getEmInternalApi(this.em).isMerging(entity) ? meta.reactablesIncludingReadOnly! : meta.reactables!;
  }

  private getReactablesByField(entity: Entity, fieldName: string): readonly Reactable[] {
    const meta = getMetadata(entity);
    const byField = getEmInternalApi(this.em).isMerging(entity)
      ? meta.reactablesIncludingReadOnlyByField!
      : meta.reactablesByField!;
    // Most fields have no reactables, so return a shared empty array instead of allocating one per set
    return byField.get(fieldName) ?? noReactables;
  }
}

/** A transition awaiting its guards and callbacks. */
interface PendingTransition {
  entity: Entity;
  fieldName: string;
  step: TransitionStep;
}

/** A matching commit callback whose transition's guards have already passed. */
interface PendingCommitCallback {
  entity: Entity;
  callback: TransitionCallback;
  step: TransitionStep;
}

/** Groups queued work into parallel waves while preserving each entity's input order. */
function groupIntoEntityWaves<T extends { entity: Entity }>(batch: readonly T[]): T[][] {
  const waves: T[][] = [];
  const waveByEntity = new Map<Entity, number>();
  // I.e. [ba1 Signed, ba1 Paid, ba2 Signed] becomes [[ba1 Signed, ba2 Signed], [ba1 Paid]].
  for (const pending of batch) {
    const wave = waveByEntity.get(pending.entity) ?? 0;
    (waves[wave] ??= []).push(pending);
    waveByEntity.set(pending.entity, wave + 1);
  }
  return waves;
}

/** A shared frozen array for fields with no downstream reactables. */
const noReactables: readonly Reactable[] = Object.freeze([]);

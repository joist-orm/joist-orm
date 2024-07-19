import ansis from "ansis";
import { Entity } from "./Entity";
import { EntityMetadata, getBaseAndSelfMetas, getMetadata } from "./EntityMetadata";
import { ReactiveField } from "./config";
import { NoIdError } from "./index";
import { followReverseHint } from "./reactiveHints";
import { Relation } from "./relations";
import { AbstractPropertyImpl } from "./relations/AbstractPropertyImpl";
import { groupBy } from "./utils";

const { gray, green, yellow, white } = ansis;

let globalLogger: ReactionLogger | undefined = undefined;
type WriteFn = (line: string) => void;

/**
 * Manages the reactivity of tracking which source fields have changed and finding/recalculating
 * their downstream derived fields.
 *
 * Source fields are usually regular/dumb primitives, i.e. `Author.age` is a source field
 * of `Book.isPublic`, but derived fields can themselves be source fields as well.
 */
export class ReactionsManager {
  /** Stores all source `ReactiveField`s that have been marked for later traversal. */
  private pendingFieldReactions: Map<ReactiveField, { todo: Set<Entity>; done: Set<Entity> }> = new Map();
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
  private relationsPendingAssignedIds: Set<Relation<any, any>> = new Set();
  private needsRecalc = { populate: false, query: false };
  private logger: ReactionLogger | undefined = globalLogger;

  /**
   * Queue all downstream reactive fields that depend on `fieldName` as a source field.
   *
   * This method can be synchronous b/c we internally queue the `ReactiveField` reverse
   * indexes on the given source `fieldName`, and don't crawl/walk back to the downstream
   * entities/fields until `recalcPendingDerivedValues` is called.
   */
  queueDownstreamReactiveFields(entity: Entity, fieldName: string): void {
    // Use the reverse index of ReactiveFields that configureMetadata sets up
    const rfs = getBaseAndSelfMetas(getMetadata(entity)).flatMap((m) => m.config.__data.reactiveDerivedValues);
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
        this.getPending(rf).todo.add(entity);
        this.getDirtyFields(getMetadata(rf.cstr)).add(rf.name);
        this.needsRecalc[rf.kind] = true;
        this.logger?.logQueued(entity, fieldName, rf);
      }
    }
  }

  /** Dequeues reactivity on `fieldName`, i.e. if it's no longer dirty. */
  dequeueDownstreamReactiveFields(entity: Entity, fieldName: string): void {
    // Use the reverse index of ReactiveFields that configureMetadata sets up
    const rfs = getBaseAndSelfMetas(getMetadata(entity)).flatMap((m) => m.config.__data.reactiveDerivedValues);
    for (const rf of rfs) {
      if (rf.fields.includes(fieldName)) {
        const pending = this.getPending(rf);
        if (pending.done.has(entity)) {
          // Ironically, if we've already run this RF, asking to dequeue probably means
          // we need run it again (to recalc its value), b/c this could be a mid-flush change, i.e.:
          // - firstName = a1 from db
          // - firstName is changed to a2, triggers initials RF
          // - firstName is changed back to a1, which is the original value, so setField
          //   thinks we can dequeue the RF
          // - but actually our RF needs to be re-run with the restored value
          pending.todo.add(entity);
        } else if (rf.fields.length === 1) {
          // We can only delete/dequeue a reaction if `fieldName` is the only or last field
          // that had triggered `rf` to run. Since we don't track that currently, i.e. we'd
          // need to have a `Pending.dirtyFields`, for now just only dequeue if `rf` only
          // has one field (which is us) anyway.
          pending.todo.delete(entity);
        }
      }
    }
  }

  /** Queue all downstream reactive fields that depend on this entity being created or deleted. */
  queueAllDownstreamFields(entity: Entity, reason: "created" | "deleted"): void {
    const rfs = getBaseAndSelfMetas(getMetadata(entity)).flatMap((m) => m.config.__data.reactiveDerivedValues);
    for (const rf of rfs) {
      this.getPending(rf).todo.add(entity);
      this.getDirtyFields(getMetadata(rf.cstr)).add(rf.name);
      this.needsRecalc[rf.kind] = true;
      this.logger?.logQueuedAll(entity, reason, rf);
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
   * Given source `ReactiveField` "reverse indexes" that have been queued as dirty by calls
   * to setters, `em.register`, or `em.delete`, asynchronously walks/crawls to the downstream
   * derived fields and calls `.load()` on them to calc.
   *
   * We also do this in a loop to handle reactive fields depending on other reactive fields.
   */
  async recalcPendingDerivedValues(kind: "reactiveFields" | "reactiveQueries") {
    // Map our parameter `kind` value (which is a nicer name) to the shorter ADT kind
    const k = kind === "reactiveFields" ? "populate" : "query";
    if (this.needsRecalc[k]) {
      this.logger?.logStartingRecalc(kind);
    }

    let loops = 0;
    while (this.needsRecalc[k]) {
      // ...we probably should only loop for `kind=populate` ReactiveFields, and `kind=query`
      // ReactiveQueryFields should probably only have a single loop, after which we return and
      // let `em.flush` push the latest values to the db, so our 2nd-order ReactiveQueryFields
      // will see the latest value.
      this.needsRecalc[k] = false;
      const relations = await Promise.all(
        [...this.pendingFieldReactions.entries()].map(async ([rf, pending]) => {
          // Skip reactive queries until post-flush
          if (kind === "reactiveFields" && rf.kind === "query") return [];
          if (kind === "reactiveQueries" && rf.kind === "populate") return [];

          // Copy pending and clear it
          const todo = [...pending.todo];
          if (todo.length === 0) return [];
          pending.todo.clear();
          for (const doing of todo) pending.done.add(doing);
          // Walk back from the source to any downstream fields
          const relations = (await followReverseHint(todo, rf.path))
            .filter((entity) => !entity.isDeletedEntity)
            .filter((e) => e instanceof rf.cstr)
            .map((entity) => (entity as any)[rf.name]);
          this.logger?.logWalked(todo, rf, relations);
          return relations;
        }),
      );
      // Multiple reactions could have pointed back to the same reactive field, so
      // dedupe the found relations before calling .load.
      const unique = [...new Set(relations.flat())];
      this.logger?.logLoading(unique);
      // Use allSettled so that we can watch for derived values that want to use the entity'd id,
      // i.e. they can fail, but we'll queue them from later.
      const startTime = this.logger?.now() ?? 0;
      const results = await Promise.allSettled(unique.map((r: any) => r.load()));
      const endTime = this.logger?.now() ?? 0;
      this.logger?.logLoadingTime(endTime - startTime);
      const failures: any[] = [];
      results.forEach((result, i) => {
        if (result.status === "rejected") {
          if (result.reason instanceof NoIdError) {
            this.relationsPendingAssignedIds.add(unique[i]);
          } else {
            failures.push(result.reason);
          }
        }
      });
      if (failures.length > 0) throw failures[0];

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

  get hasFieldsPendingAssignedIds(): boolean {
    return this.relationsPendingAssignedIds.size > 0;
  }

  async recalcRelationsPendingAssignedIds(): Promise<void> {
    const relations = [...this.relationsPendingAssignedIds];
    this.relationsPendingAssignedIds.clear();
    await Promise.all(
      relations.filter((r) => r instanceof AbstractPropertyImpl && !r.entity.isDeletedEntity).map((r: any) => r.load()),
    );
  }

  setLogger(logger: ReactionLogger | undefined): void {
    this.logger = logger;
  }

  private getPending(rf: ReactiveField): { todo: Set<Entity>; done: Set<Entity> } {
    let pending = this.pendingFieldReactions.get(rf);
    if (!pending) {
      pending = { todo: new Set(), done: new Set() };
      this.pendingFieldReactions.set(rf, pending);
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
}

export function setReactionLogging(enabled: boolean): void;
export function setReactionLogging(logger: ReactionLogger): void;
export function setReactionLogging(arg: boolean | ReactionLogger): void {
  globalLogger = typeof arg === "boolean" ? (arg ? new ReactionLogger() : undefined) : arg;
}

export class ReactionLogger {
  private writeFn: WriteFn;

  // We default to process.stdout.write to side-step around Jest's console.log instrumentation
  constructor(writeFn: WriteFn = process.stdout.write.bind(process.stdout)) {
    this.writeFn = writeFn;
  }

  now(): number {
    return performance.now();
  }

  logQueued(entity: Entity, fieldName: string, rf: ReactiveField): void {
    this.log(
      green.bold(`${entity.toTaggedString()}`) + yellow(`.${fieldName}`),
      gray(`changed, queuing`),
      green.bold(`${entity.toTaggedString()}`) + yellow(maybeDotPath(rf)) + yellow(rf.name),
    );
  }

  logQueuedAll(entity: Entity, reason: string, rf: ReactiveField): void {
    this.log(
      green.bold(`${entity.toTaggedString()}`),
      gray(`${reason}, queuing`),
      green.bold(`${entity.toTaggedString()}`) + green(maybeDotPath(rf)) + yellow(rf.name),
    );
  }

  logStartingRecalc(kind: "reactiveFields" | "reactiveQueries"): void {
    this.log(white.bold(`Recalculating reactive ${kind === "reactiveQueries" ? "queries" : "fields"} values...`));
  }

  logWalked(todo: Entity[], rf: ReactiveField, relations: Relation<any, any>[]): void {
    // Keep for future debugging...
    const from = todo[0].constructor.name;
    this.log(
      " ", // indent
      gray(`Walked`),
      white(`${todo.length}`),
      green.bold(`${from}`) + green(`.${rf.path.join(".")}`),
      gray("paths, found"),
      white(`${relations.length}`),
      green.bold(`${rf.cstr.name}`) + green(".") + yellow(rf.name),
      gray("to recalc"),
    );
    if (relations.length > 0) {
      this.log(
        "   ", // indent
        gray("["),
        todo.map((e) => e.toTaggedString()).join(" "),
        gray("] -> ["),
        [...new Set(relations)].map((r) => r.entity.toTaggedString()).join(" "),
        gray("]"),
      );
    }
  }

  logLoading(relations: any[]): void {
    this.log(" ", gray("Loading"), String(relations.length), gray("relations..."));
    // Group by the relation name
    [...groupBy(relations, (r) => `${r.entity.constructor.name}.${r.fieldName}`).entries()].forEach(([, relations]) => {
      const r = relations[0];
      this.log(
        "   ",
        green.bold(r.entity.constructor.name) + green(".") + yellow(r.fieldName),
        gray("-> ["),
        String(relations.map((r: any) => r.entity.toTaggedString()).join(" ")),
        gray("]"),
      );
    });
  }

  logLoadingTime(millis: number): void {
    this.log("   ", gray("took"), String(Math.floor(millis)), gray("millis"));
  }

  private log(...line: string[]): void {
    this.writeFn(`${line.join(" ")}\n`);
  }
}

function maybeDotPath(rf: ReactiveField): string {
  return rf.path.length > 0 ? `.${rf.path.join(".")}.` : ".";
}

import type { Entity } from "src/Entity.ts";
import { type EntityManager, getEmInternalApi, invokeRule } from "src/EntityManager.ts";
import { type EntityMetadata, getBaseAndSelfMetas, getMetadata } from "src/EntityMetadata.ts";
import { NoIdError } from "src/index.ts";
import { ValidationErrors } from "src/rules.ts";
import { type MaybePromise, fail, failIfAnyRejected } from "src/utils.ts";

/**
 * Which state transitions of an enum field a `guardTransition` cares about.
 *
 * Omitting `from` or `to` matches any state. Guards never run on creation.
 */
export interface GuardTransitionMatch<V> {
  from?: V | readonly V[];
  to?: V | readonly V[];
}

/**
 * Which state transitions of an enum field an `onTransition` callback handles.
 *
 * Creating an entity with a matching `to` state also matches, unless `from` is set or `onCreate` is `false`.
 */
export interface OnTransitionMatch<V> extends GuardTransitionMatch<V> {
  /**
   * Whether `onTransition` fires when an entity is created with a matching `to` state, defaults to `true`.
   *
   * Entering a state by creation usually needs the same side effects as entering it by a transition, and
   * forgetting them is easy to miss. Set `false` for reactions that only make sense for a transition.
   */
  onCreate?: boolean;
  /** `commit` runs in `beforeCommit`, i.e. to enqueue jobs; `flush` (the default) runs as a reaction. */
  phase?: "flush" | "commit";
}

/** Maps each state to the states it may transition to, i.e. `{ Draft: ["Open"], Open: ["Closed"] }`. */
export type TransitionTable<V extends PropertyKey> = Partial<Record<V, readonly V[]>>;

/**
 * The transition a guard or reaction is handling, i.e. `{ from: "DRAFT", to: "OPEN" }`.
 *
 * Guards and reactions run during `em.flush`, after the assignment, so the entity may already be in a
 * later state. This tells them which transition they're handling. `from` is `undefined` for creation.
 */
export interface Transition<V> {
  from: V | undefined;
  to: V;
}

/** The "from" state of a just-created entity, because `undefined` can be a real field value. */
export const created: unique symbol = Symbol("created");

/** A single recorded transition of a field, with `from` as `created` for creation. */
export interface TransitionStep {
  from: unknown;
  to: unknown;
}

/** A registered callback, dispatched only after its transition's guards pass. */
export interface TransitionCallback<T extends Entity = Entity, C = unknown> {
  name: string;
  phase: "flush" | "commit";
  matches(entity: T, step: TransitionStep): boolean;
  run(entity: T, ctx: C, step: TransitionStep): MaybePromise<unknown>;
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

/** Owns an EntityManager's unprocessed transitions and deferred commit callbacks. */
export interface TransitionState {
  /** Transitions are consumed once; callbacks that change state append work for the next pass. */
  pending: PendingTransition[];
  /** Initial assignments are collapsed until reactions first see the entity. */
  creations: Map<Entity, Map<string, TransitionStep>>;
  /** New entities that reactions have seen, so their assignments are transitions. */
  created: Set<Entity>;
  /** Only matching callbacks are retained until SQL and final validation finish. */
  commit: PendingCommitCallback[];
}

/**
 * Called by `setField` before changing an enum field, to check and record the transition.
 *
 * An entity has no previous state until Joist's reactions have seen it, so every assignment to a new
 * entity until then is part of its creation. I.e. `em.create` then `entity.status = Open`, or a factory
 * setting a default and then a `withStatus` value, or `em.findOrCreate` creating then upserting, all
 * create the entity as `Open`. Creation isn't checked against the `transitions` table.
 */
export function maybeRecordTransition(entity: Entity, fieldName: string, from: unknown, to: unknown): void {
  const meta = getMetadata(entity);
  if (!meta.transitionFields!.has(fieldName)) return;
  const state = getEmInternalApi(entity.em).transitionState;
  if (entity.isNewEntity && !state.created.has(entity)) {
    setCreationStep(entity, fieldName, to);
    return;
  }
  // Like validation rules, subtype restrictions supplement the base type's restrictions.
  for (const m of getBaseAndSelfMetas(meta)) {
    const error = m.config.__data.transitionTables[fieldName]?.(entity, from, to);
    if (error) throw new ValidationErrors([{ entity, message: error }]);
  }
  state.pending.push({ entity, fieldName, step: { from, to } });
}

/** Sets a factory's `withStatus` value, and forgets the entity's creation, so creating it fires nothing. */
export function seedTransition(entity: Entity, fieldName: string, set: () => void): void {
  set();
  getEmInternalApi(entity.em).transitionState.creations.get(entity)?.delete(fieldName);
}

/**
 * Ends the creation of every new entity so far, called by `em.flush` before each loop of reactions.
 *
 * After this, assignments to those entities are transitions, i.e. an Approval created as `Requested`
 * that a reaction then auto-approves records `Requested -> Approved`.
 */
export function endTransitionCreations(em: EntityManager): void {
  const state = getEmInternalApi(em).transitionState;
  for (const [entity, byField] of state.creations) {
    state.created.add(entity);
    for (const [fieldName, step] of byField) state.pending.push({ entity, fieldName, step });
  }
  state.creations.clear();
}

/** Returns whether a reaction pass needs to process transitions or finalize initial states. */
export function hasPendingTransitions(em: EntityManager): boolean {
  const state = getEmInternalApi(em).transitionState;
  return state.pending.length > 0 || state.creations.size > 0;
}

/**
 * Evaluates each pending transition's guards once, then dispatches its matching callbacks.
 *
 * I.e. Pending -> Signed -> Pending restores an advance's original status, but the Signed guard must still run.
 * Callbacks can append more transitions; taking one batch leaves those for the next reaction pass.
 *
 * We might eventually treat A -> B -> A as an undo and ignore both transitions before reactions
 * have seen them. For now, each transition is meaningful, even when the final state is unchanged.
 */
export async function processPendingTransitions(em: EntityManager): Promise<void> {
  // Ordinary reactions may have created more entities during this pass.
  endTransitionCreations(em);
  const state = getEmInternalApi(em).transitionState;
  const batch = state.pending.splice(0);
  for (const { entity, fieldName, step } of batch) {
    if (entity.isDeletedEntity) continue;
    const meta = getMetadata(entity);
    if (step.from !== created) {
      const guards = meta.transitionRules!.get(fieldName) ?? [];
      const results = await Promise.allSettled(guards.map((guard) => invokeRule(entity, () => guard(entity, step))));
      const errors = failIfAnyRejected(results).flat();
      if (errors.length > 0) throw new ValidationErrors(errors);
    }
    for (const callback of meta.transitionCallbacks!.get(fieldName) ?? []) {
      if (entity.isDeletedEntity) break;
      if (!callback.matches(entity, step)) continue;
      if (callback.phase === "commit") {
        state.commit.push({ entity, callback, step });
      } else {
        await runTransitionCallback(em, entity, callback, step);
      }
    }
  }
}

/** Returns whether callbacks need a commit phase, even if there are no net SQL changes. */
export function hasPendingCommitTransitions(em: EntityManager): boolean {
  return getEmInternalApi(em).transitionState.commit.some((pending) => !pending.entity.isDeletedEntity);
}

/** Runs the queued callbacks after all SQL and validation succeed, without rechecking guards. */
export async function runCommitTransitions(em: EntityManager): Promise<void> {
  const batch = getEmInternalApi(em).transitionState.commit.splice(0);
  for (const { entity, callback, step } of batch) {
    if (!entity.isDeletedEntity) await callback.run(entity, em.ctx, step);
  }
}

/** Clears pending transitions and creation bookkeeping when `em.flush` succeeds. */
export function clearTransitionState(em: EntityManager): void {
  const state = getEmInternalApi(em).transitionState;
  state.pending.length = 0;
  state.creations.clear();
  state.created.clear();
  state.commit.length = 0;
}

/** Returns whether `step` matches `match`'s `from`, `to`, and `onCreate` settings. */
export function matchesTransition(match: OnTransitionMatch<unknown>, step: TransitionStep): boolean {
  if (step.from === created) {
    // `from` describes a previous state, which a new entity doesn't have
    if (match.onCreate === false || match.from !== undefined) return false;
  } else if (!matchesValue(match.from, step.from)) {
    return false;
  }
  return matchesValue(match.to, step.to);
}

/** Converts an internal step to the `Transition` that guards and reactions receive. */
export function toTransition(step: TransitionStep): Transition<any> {
  return { from: step.from === created ? undefined : step.from, to: step.to };
}

/** Converts a `transitions` table's keys and values to codes, so rules can compare them to field values. */
export function toCodesTable(
  meta: EntityMetadata,
  fieldName: string,
  table: Record<string, readonly unknown[] | undefined>,
): Map<unknown, readonly unknown[]> {
  return new Map(
    Object.entries(table).map(([from, tos]) => [
      accessorToCode(meta, fieldName, from),
      toCodes(meta, fieldName, tos ?? []) as unknown[],
    ]),
  );
}

/** Returns a `match` checker that converts the match's accessors to codes once per entity type. */
export function newMatcher(
  fieldName: string,
  match: OnTransitionMatch<any>,
): (entity: Entity, step: TransitionStep) => boolean {
  const byMeta = new Map<EntityMetadata, OnTransitionMatch<unknown>>();
  return (entity, step) => {
    const meta = getMetadata(entity);
    let codes = byMeta.get(meta);
    if (!codes) {
      codes = { ...match, from: toCodes(meta, fieldName, match.from), to: toCodes(meta, fieldName, match.to) };
      byMeta.set(meta, codes);
    }
    return matchesTransition(codes, step);
  };
}

/** Converts an enum accessor, i.e. `Rejected`, to its code, i.e. `REJECTED`, and fails on anything else. */
function accessorToCode(meta: EntityMetadata, fieldName: string, value: unknown): unknown {
  const field = meta.allFields[fieldName];
  if (field?.kind !== "enum") fail(`${meta.type}.${fieldName} is not an enum field, so it can't have transitions`);
  // Only accessors are accepted, even from untyped callers, so every table reads the same way
  if (typeof value !== "string" || !Object.hasOwn(field.enumType, value)) {
    fail(`Unknown ${meta.type}.${fieldName} accessor ${String(value)}, i.e. use "Draft" for AuthorStatus.Draft`);
  }
  return field.enumType[value];
}

/** Converts one or more enum accessors to codes, preserving an omitted match. */
function toCodes(meta: EntityMetadata, fieldName: string, values: unknown): unknown {
  if (values === undefined) return undefined;
  return Array.isArray(values)
    ? values.map((v) => accessorToCode(meta, fieldName, v))
    : accessorToCode(meta, fieldName, values);
}

/** Sets the `to` of `entity`'s creation step, since it may be assigned several times while being created. */
function setCreationStep(entity: Entity, fieldName: string, to: unknown): void {
  const { creations } = getEmInternalApi(entity.em).transitionState;
  let byField = creations.get(entity);
  if (!byField) creations.set(entity, (byField = new Map()));
  byField.set(fieldName, { from: created, to });
}

/** Assigns ids if a creation callback needs them, as ordinary reactions do. */
async function runTransitionCallback(
  em: EntityManager,
  entity: Entity,
  callback: TransitionCallback,
  step: TransitionStep,
): Promise<void> {
  try {
    await callback.run(entity, em.ctx, step);
  } catch (error) {
    if (!(error instanceof NoIdError)) throw error;
    await em.assignNewIds();
    await callback.run(entity, em.ctx, step);
  }
}

function matchesValue(expected: unknown, value: unknown): boolean {
  if (expected === undefined) return true;
  return Array.isArray(expected) ? expected.includes(value) : expected === value;
}

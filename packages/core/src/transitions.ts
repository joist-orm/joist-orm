import type { Entity } from "src/Entity.ts";
import type { EntityManager } from "src/EntityManager.ts";
import { getMetadata } from "src/EntityMetadata.ts";
import { ValidationErrors } from "src/rules.ts";

/**
 * Which state transitions of an enum field a `guardTransition` or `onTransition` cares about.
 *
 * Omitting `from` or `to` matches any state. For `onTransition`, creating an entity with a matching
 * `to` state also matches, unless `from` is set or `onCreate` is `false`. Guards never run on creation.
 */
export interface TransitionMatch<V> {
  from?: V | readonly V[];
  to?: V | readonly V[];
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

/**
 * Records, per EntityManager, every transition of each transition field since the last successful flush.
 *
 * Setters are synchronous but guards and reactions are async, so setters check the `transitions` table
 * immediately, and record each transition here for `em.flush` to run the guards and reactions later.
 * Each reaction keeps a cursor into the log, so it handles each transition exactly once.
 */
interface TransitionState {
  /** Entity -> field name -> every transition of that field, in order. */
  steps: Map<Entity, Map<string, TransitionStep[]>>;
  /** Reaction name -> entity -> how many of that entity's transitions the reaction has handled. */
  cursors: Map<string, Map<Entity, number>>;
}

const states = new WeakMap<EntityManager, TransitionState>();

/** True while a factory sets a `withStatus` value, which is neither checked nor recorded. */
let seeding = false;

/**
 * Called by `setField` before changing an enum field, to check and record the transition.
 *
 * Setting the starting state of a new entity, i.e. from constructor opts or a default, is creation,
 * not a transition, so it isn't checked against the `transitions` table.
 */
export function maybeRecordTransition(entity: Entity, fieldName: string, from: unknown, to: unknown): void {
  const data = getMetadata(entity).config.__data;
  if (seeding || !data.transitionFields.has(fieldName)) return;
  if (entity.isNewEntity && from === undefined) {
    addStep(entity, fieldName, { from: created, to });
    return;
  }
  const error = data.transitionTables[fieldName]?.(entity, from, to);
  if (error) throw new ValidationErrors([{ entity, message: error }]);
  addStep(entity, fieldName, { from, to });
}

/**
 * Sets a factory's `withStatus` value, so the entity's creation fires nothing.
 *
 * Factories create the entity with a default state first, i.e. the enum's first value, so we skip
 * checking and recording this assignment, and forget the default's creation transition.
 */
export function seedTransition(entity: Entity, fieldName: string, set: () => void): void {
  seeding = true;
  try {
    set();
  } finally {
    seeding = false;
  }
  getState(entity.em).steps.get(entity)?.delete(fieldName);
}

/** Returns every transition of `fieldName` on `entity` since the last successful flush. */
export function getTransitionSteps(entity: Entity, fieldName: string): readonly TransitionStep[] {
  return states.get(entity.em)?.steps.get(entity)?.get(fieldName) ?? noSteps;
}

/** Returns the transitions that `reactionName` hasn't handled yet, without marking them as handled. */
export function getPendingTransitionSteps(
  reactionName: string,
  entity: Entity,
  fieldName: string,
): readonly TransitionStep[] {
  const cursor = states.get(entity.em)?.cursors.get(reactionName)?.get(entity) ?? 0;
  return getTransitionSteps(entity, fieldName).slice(cursor);
}

/** Marks one more of `entity`'s transitions as handled by `reactionName`. */
export function advanceTransitionCursor(reactionName: string, entity: Entity): void {
  const { cursors } = getState(entity.em);
  let byEntity = cursors.get(reactionName);
  if (!byEntity) cursors.set(reactionName, (byEntity = new Map()));
  byEntity.set(entity, (byEntity.get(entity) ?? 0) + 1);
}

/**
 * Forgets all recorded transitions, called when `em.flush` succeeds.
 *
 * A failed flush keeps them, so a retry still runs the guards and reactions for transitions that
 * haven't been handled yet, and doesn't re-run reactions for ones that have.
 */
export function clearTransitionState(em: EntityManager): void {
  states.delete(em);
}

/** Returns whether `step` matches `match`'s `from`, `to`, and `onCreate` settings. */
export function matchesTransition(match: TransitionMatch<unknown>, step: TransitionStep): boolean {
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

function addStep(entity: Entity, fieldName: string, step: TransitionStep): void {
  const { steps } = getState(entity.em);
  let byField = steps.get(entity);
  if (!byField) steps.set(entity, (byField = new Map()));
  let list = byField.get(fieldName);
  if (!list) byField.set(fieldName, (list = []));
  list.push(step);
}

function getState(em: EntityManager): TransitionState {
  let state = states.get(em);
  if (!state) states.set(em, (state = { steps: new Map(), cursors: new Map() }));
  return state;
}

function matchesValue(expected: unknown, value: unknown): boolean {
  if (expected === undefined) return true;
  return Array.isArray(expected) ? expected.includes(value) : expected === value;
}

const noSteps: readonly TransitionStep[] = Object.freeze([]);

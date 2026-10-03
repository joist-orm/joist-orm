import { getInstanceData } from "src/BaseEntity.ts";
import type { Entity } from "src/Entity.ts";
import type { EntityManager } from "src/EntityManager.ts";
import { getField } from "src/fields.ts";

/**
 * Which changes of an enum-ish field a `guardTransition` or `onTransition` cares about.
 *
 * Omitting `from` or `to` matches any value. For `onTransition`, creating an entity with a matching
 * `to` value also matches, unless `from` is set or `onCreate` is `false`. Guards never run on creation.
 */
export interface TransitionMatch<V> {
  from?: V | readonly V[];
  to?: V | readonly V[];
  /**
   * Whether `onTransition` fires when an entity is created with a matching `to` value, defaults to `true`.
   *
   * Entering a value by creation usually needs the same side effects as entering it by a change, and
   * forgetting them is easy to miss. Set `false` for reactions that only make sense for a change.
   */
  onCreate?: boolean;
  /** `commit` runs in `beforeCommit`, i.e. to enqueue jobs; `flush` (the default) runs as a reaction. */
  phase?: "flush" | "commit";
}

/** Maps each value to the values it may change to, i.e. `{ Draft: ["Open"], Open: ["Closed"] }`. */
export type TransitionTable<V extends PropertyKey> = Partial<Record<V, readonly V[]>>;

/** The "previous value" of a just-created entity, because `undefined` can be a real field value. */
export const created: unique symbol = Symbol("created");

/** A single observed change of a transition field. */
export interface TransitionStep {
  from: unknown;
  to: unknown;
}

/**
 * Remembers, per EntityManager, the last value each `onTransition` reaction saw for each entity.
 *
 * Reactions can be queued many times per flush (i.e. when their entity is touched again by
 * another reaction), so this memory is what makes each observed change fire exactly once.
 * It is cleared at the end of every `em.flush`, after which `originalValue` is the baseline again.
 */
interface TransitionState {
  /** Reaction name -> entity -> the last value that reaction saw. */
  lastSeen: Map<string, Map<Entity, unknown>>;
  /** Field name -> entity -> a created value that a factory asked us to trust, i.e. `withStatus`. */
  seeds: Map<string, Map<Entity, unknown>>;
  /** Rule name -> entity -> disallowed changes seen during the flush, reported by validation. */
  errors: Map<string, Map<Entity, string[]>>;
}

const states = new WeakMap<EntityManager, TransitionState>();

/**
 * Records `value` as already seen by every `onTransition` on `fieldName`, for `entity`'s first flush.
 *
 * Factories call this for `withStatus`-style opts, so creating the entity fires nothing.
 */
export function seedTransition(entity: Entity, fieldName: string, value: unknown): void {
  const { seeds } = getState(entity.em);
  let byEntity = seeds.get(fieldName);
  if (!byEntity) seeds.set(fieldName, (byEntity = new Map()));
  byEntity.set(entity, value);
}

/** Forgets all remembered transitions, called at the end of every `em.flush`. */
export function clearTransitionState(em: EntityManager): void {
  states.delete(em);
}

/**
 * Returns the change since `reactionName` last looked at `entity`, or `undefined` if there is none.
 *
 * The first look uses the pre-flush value (or `created` for new entities, unless seeded).
 */
export function takeTransitionStep(
  reactionName: string,
  entity: Entity,
  fieldName: string,
): TransitionStep | undefined {
  const state = getState(entity.em);
  let seen = state.lastSeen.get(reactionName);
  if (!seen) state.lastSeen.set(reactionName, (seen = new Map()));
  const to = getField(entity, fieldName);
  const from = seen.has(entity) ? seen.get(entity) : baselineValue(state, entity, fieldName);
  if (from === to) return undefined;
  seen.set(entity, to);
  return { from, to };
}

/** Remembers a disallowed change, so the `ruleName` validation rule can report it later in the flush. */
export function addTransitionError(ruleName: string, entity: Entity, message: string): void {
  const { errors } = getState(entity.em);
  let byEntity = errors.get(ruleName);
  if (!byEntity) errors.set(ruleName, (byEntity = new Map()));
  let messages = byEntity.get(entity);
  if (!messages) byEntity.set(entity, (messages = []));
  messages.push(message);
}

/** Returns the disallowed changes that `ruleName` saw for `entity` during this flush. */
export function getTransitionErrors(ruleName: string, entity: Entity): string[] | undefined {
  return states.get(entity.em)?.errors.get(ruleName)?.get(entity);
}

/** Returns the net change of `fieldName` across this flush, for commit-phase transitions. */
export function netTransitionStep(entity: Entity, fieldName: string): TransitionStep | undefined {
  const to = getField(entity, fieldName);
  const from = baselineValue(getState(entity.em), entity, fieldName);
  return from === to ? undefined : { from, to };
}

/** Returns whether `step` matches `match`'s `from`, `to`, and `onCreate` settings. */
export function matchesTransition(match: TransitionMatch<unknown>, step: TransitionStep): boolean {
  if (step.from === created) {
    // `from` describes a previous value, which a new entity doesn't have
    if (match.onCreate === false || match.from !== undefined) return false;
  } else if (!matchesValue(match.from, step.from)) {
    return false;
  }
  return matchesValue(match.to, step.to);
}

function getState(em: EntityManager): TransitionState {
  let state = states.get(em);
  if (!state) states.set(em, (state = { lastSeen: new Map(), seeds: new Map(), errors: new Map() }));
  return state;
}

/** The value a field had before this flush started, from the point of view of transitions. */
function baselineValue(state: TransitionState, entity: Entity, fieldName: string): unknown {
  const seeded = state.seeds.get(fieldName);
  if (seeded?.has(entity)) return seeded.get(entity);
  if (entity.isNewEntity) return created;
  const { originalData } = getInstanceData(entity);
  return fieldName in originalData ? originalData[fieldName] : getField(entity, fieldName);
}

function matchesValue(expected: unknown, value: unknown): boolean {
  if (expected === undefined) return true;
  return Array.isArray(expected) ? expected.includes(value) : expected === value;
}

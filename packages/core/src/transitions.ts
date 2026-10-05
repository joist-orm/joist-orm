import type { Entity } from "src/Entity.ts";
import type { EntityManager } from "src/EntityManager.ts";
import { type EntityMetadata, getBaseAndSelfMetas, getMetadata } from "src/EntityMetadata.ts";
import { ValidationErrors } from "src/rules.ts";
import { fail } from "src/utils.ts";

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
  /** New entities whose assignments still count as their creation, because reactions haven't seen them yet. */
  creating: Set<Entity>;
  /** New entities that reactions have seen, so their assignments are transitions. */
  created: Set<Entity>;
}

const states = new WeakMap<EntityManager, TransitionState>();

/**
 * Called by `setField` before changing an enum field, to check and record the transition.
 *
 * An entity has no previous state until Joist's reactions have seen it, so every assignment to a new
 * entity until then is part of its creation. I.e. `em.create` then `entity.status = Open`, or a factory
 * setting a default and then a `withStatus` value, or `em.findOrCreate` creating then upserting, all
 * create the entity as `Open`. Creation isn't checked against the `transitions` table.
 * Returns whether the field has transition configuration and its change was recorded.
 */
export function maybeRecordTransition(entity: Entity, fieldName: string, from: unknown, to: unknown): boolean {
  const meta = getMetadata(entity);
  if (!meta.transitionFields!.has(fieldName)) return false;
  const state = getState(entity.em);
  if (entity.isNewEntity && !state.created.has(entity)) {
    state.creating.add(entity);
    setCreationStep(entity, fieldName, to);
    return true;
  }
  // Like validation rules, subtype restrictions supplement the base type's restrictions.
  for (const m of getBaseAndSelfMetas(meta)) {
    const error = m.config.__data.transitionTables[fieldName]?.(entity, from, to);
    if (error) throw new ValidationErrors([{ entity, message: error }]);
  }
  addStep(entity, fieldName, { from, to });
  return true;
}

/** Sets a factory's `withStatus` value, and forgets the entity's creation, so creating it fires nothing. */
export function seedTransition(entity: Entity, fieldName: string, set: () => void): void {
  set();
  getState(entity.em).steps.get(entity)?.delete(fieldName);
}

/**
 * Ends the creation of every new entity so far, called by `em.flush` before each loop of reactions.
 *
 * After this, assignments to those entities are transitions, i.e. an Approval created as `Requested`
 * that a reaction then auto-approves records `Requested -> Approved`.
 */
export function endTransitionCreations(em: EntityManager): void {
  const state = states.get(em);
  if (!state || state.creating.size === 0) return;
  for (const entity of state.creating) state.created.add(entity);
  state.creating.clear();
}

/** Returns every transition of `fieldName` on `entity` since the last successful flush. */
export function getTransitionSteps(entity: Entity, fieldName: string): readonly TransitionStep[] {
  return states.get(entity.em)?.steps.get(entity)?.get(fieldName) ?? noSteps;
}

/** Returns recorded transitions, including entities and fields with no net database changes. */
export function getTransitionEntries(
  em: EntityManager,
): Iterable<readonly [Entity, ReadonlyMap<string, readonly TransitionStep[]>]> {
  return states.get(em)?.steps ?? [];
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
  const { steps } = getState(entity.em);
  let byField = steps.get(entity);
  if (!byField) steps.set(entity, (byField = new Map()));
  byField.set(fieldName, [{ from: created, to }]);
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
  if (!state)
    states.set(em, (state = { steps: new Map(), cursors: new Map(), creating: new Set(), created: new Set() }));
  return state;
}

function matchesValue(expected: unknown, value: unknown): boolean {
  if (expected === undefined) return true;
  return Array.isArray(expected) ? expected.includes(value) : expected === value;
}

const noSteps: readonly TransitionStep[] = Object.freeze([]);

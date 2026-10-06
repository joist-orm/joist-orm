import type { Entity } from "src/Entity.ts";
import { type EntityMetadata, getMetadata } from "src/EntityMetadata.ts";
import { type MaybePromise, fail } from "src/utils.ts";

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

/** Checks a transition table against field values and returns an error for a disallowed change. */
export type TransitionTableCheck<T extends Entity = Entity> = (
  entity: T,
  from: unknown,
  to: unknown,
) => string | undefined;

/**
 * The transition a guard or reaction is handling, i.e. `{ from: "DRAFT", to: "OPEN" }`.
 *
 * Guards and callbacks run during reaction passes, after the assignment, so the entity may already be in a
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

/** Returns a `match` checker that converts accessors to codes on first use. */
export function newTransitionMatcher(
  fieldName: string,
  match: OnTransitionMatch<any>,
): (entity: Entity, step: TransitionStep) => boolean {
  let codes: OnTransitionMatch<unknown> | undefined;
  return (entity, step) => {
    if (!codes) {
      const meta = getMetadata(entity);
      codes = { ...match, from: toCodes(meta, fieldName, match.from), to: toCodes(meta, fieldName, match.to) };
    }
    return matchesTransition(codes, step);
  };
}

/** Returns whether `step` matches `match`'s `from`, `to`, and `onCreate` settings. */
function matchesTransition(match: OnTransitionMatch<unknown>, step: TransitionStep): boolean {
  if (step.from === created) {
    // `from` describes a previous state, which a new entity doesn't have
    if (match.onCreate === false || match.from !== undefined) return false;
  } else if (!matchesMaybeArray(match.from, step.from)) {
    return false;
  }
  return matchesMaybeArray(match.to, step.to);
}

function matchesMaybeArray(trigger: unknown, state: unknown): boolean {
  if (trigger === undefined) return true;
  return Array.isArray(trigger) ? trigger.includes(state) : trigger === state;
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

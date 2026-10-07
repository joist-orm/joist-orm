import type { Entity } from "src/Entity.ts";
import { type EntityMetadata, getBaseAndSelfMetas } from "src/EntityMetadata.ts";
import type { ValidationRuleResult } from "src/rules.ts";
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

/** A `guardTransition` as registered in config, with its `match` still using accessors. */
export interface TransitionGuardConfig<T extends Entity = Entity> {
  match: GuardTransitionMatch<string>;
  run(entity: T, step: TransitionStep): MaybePromise<ValidationRuleResult>;
}

/** An `onTransition` as registered in config, with its `match` still using accessors. */
export interface TransitionCallbackConfig<T extends Entity = Entity, C = unknown> {
  name: string;
  match: OnTransitionMatch<string>;
  run(entity: T, ctx: C, step: TransitionStep): MaybePromise<unknown>;
}

/** One field's `transitions`, `guardTransition`, and `onTransition` config on a single entity type. */
export interface FieldTransitionsConfig<T extends Entity = Entity, C = unknown> {
  tables: TransitionTable<string>[];
  guards: TransitionGuardConfig<T>[];
  callbacks: TransitionCallbackConfig<T, C>[];
}

/** A `match` with accessors converted to codes, so it can be compared to recorded steps. */
export interface TransitionMatcher {
  /** The allowed previous states, or `undefined` for any state. */
  from: readonly unknown[] | undefined;
  /** The allowed new states, or `undefined` for any state. */
  to: readonly unknown[] | undefined;
  /** Whether creation matches, which is never true when `from` is set. */
  onCreate: boolean;
}

/** A guard with its `match` converted to codes. */
export interface TransitionGuard {
  matcher: TransitionMatcher;
  run(entity: Entity, step: TransitionStep): MaybePromise<ValidationRuleResult>;
}

/** A callback with its `match` converted to codes, dispatched only after its transition's guards pass. */
export interface TransitionCallback {
  name: string;
  phase: "flush" | "commit";
  matcher: TransitionMatcher;
  run(entity: Entity, ctx: unknown, step: TransitionStep): MaybePromise<unknown>;
}

/** One field's transition config from an entity type and its base types, with accessors converted to codes. */
export interface FieldTransitions {
  /** Each table maps a `from` code to its allowed `to` codes; every table must allow a change. */
  tables: ReadonlyMap<unknown, readonly unknown[]>[];
  guards: TransitionGuard[];
  callbacks: TransitionCallback[];
}

/** Converts an internal step to the `Transition` that guards and reactions receive. */
export function toTransition(step: TransitionStep): Transition<any> {
  return { from: step.from === created ? undefined : step.from, to: step.to };
}

/**
 * Merges the transition config of `meta` and its base types by field, converting accessors to codes.
 *
 * This runs after boot, because the config is written before the enum metadata exists.
 */
export function buildFieldTransitions(meta: EntityMetadata): Map<string, FieldTransitions> {
  const byField = new Map<string, FieldTransitions>();
  for (const m of getBaseAndSelfMetas(meta)) {
    for (const [fieldName, config] of Object.entries(m.config.__data.transitions)) {
      let merged = byField.get(fieldName);
      if (!merged) byField.set(fieldName, (merged = { tables: [], guards: [], callbacks: [] }));
      for (const table of config.tables) merged.tables.push(toCodesTable(meta, fieldName, table));
      for (const { match, run } of config.guards) {
        merged.guards.push({ matcher: toMatcher(meta, fieldName, match), run });
      }
      for (const { name, match, run } of config.callbacks) {
        const matcher = toMatcher(meta, fieldName, match);
        merged.callbacks.push({ name, phase: match.phase ?? "flush", matcher, run });
      }
    }
  }
  return byField;
}

/** Returns whether `step` matches `matcher`'s `from`, `to`, and `onCreate` settings. */
export function matchesTransition(matcher: TransitionMatcher, step: TransitionStep): boolean {
  if (step.from === created) {
    if (!matcher.onCreate) return false;
  } else if (matcher.from && !matcher.from.includes(step.from)) {
    return false;
  }
  return !matcher.to || matcher.to.includes(step.to);
}

/** Uses the enum's display name in error messages when there is one, i.e. `Approved` instead of `APPROVED`. */
export function describeValue(meta: EntityMetadata, fieldName: string, value: unknown): string {
  if (value === undefined) return "unset";
  const field = meta.allFields[fieldName];
  return field?.kind === "enum" ? (field.enumDetailType.getByCode(value)?.name ?? String(value)) : String(value);
}

/** Converts a `transitions` table's keys and values to codes, so it can be compared to field values. */
function toCodesTable(
  meta: EntityMetadata,
  fieldName: string,
  table: TransitionTable<string>,
): Map<unknown, readonly unknown[]> {
  return new Map(
    Object.entries(table).map(([from, tos]) => [
      accessorToCode(meta, fieldName, from),
      toCodes(meta, fieldName, tos ?? [])!,
    ]),
  );
}

/** Converts a `match`'s accessors to codes. */
function toMatcher(meta: EntityMetadata, fieldName: string, match: OnTransitionMatch<string>): TransitionMatcher {
  return {
    from: toCodes(meta, fieldName, match.from),
    to: toCodes(meta, fieldName, match.to),
    // `from` describes a previous state, which a new entity doesn't have
    onCreate: match.onCreate !== false && match.from === undefined,
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

/** Converts one or more enum accessors to an array of codes, preserving an omitted match. */
function toCodes(
  meta: EntityMetadata,
  fieldName: string,
  values: string | readonly string[] | undefined,
): unknown[] | undefined {
  if (values === undefined) return undefined;
  return typeof values === "string"
    ? [accessorToCode(meta, fieldName, values)]
    : values.map((v) => accessorToCode(meta, fieldName, v));
}

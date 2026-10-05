import { resetConstructorMap } from "src/configure.ts";
import { AsyncDefault } from "src/defaults.ts";
import { type Entity } from "src/Entity.ts";
import {
  type EntityConstructor,
  type EntityField,
  type EntityMetadata,
  type FieldsOf,
  type LoadHint,
  type Loaded,
  type MaybeAbstractEntityConstructor,
  type Reacted,
  type ReactiveHint,
  type RelationsIn,
  type SettableFields,
  fail,
  getMetadata,
} from "src/index.ts";
import { convertToLoadHint } from "src/reactivity/reactiveHints.ts";
import { type ValidationRule, type ValidationRuleInternal, type ValidationRuleResult } from "src/rules.ts";
import {
  type GuardTransitionMatch,
  type OnTransitionMatch,
  type Transition,
  type TransitionCallback,
  type TransitionStep,
  type TransitionTable,
  newMatcher,
  toCodesTable,
  toTransition,
} from "src/transitions.ts";
import { type MaybePromise } from "src/utils.ts";

export type EntityHook =
  "beforeFlush" | "beforeCreate" | "beforeUpdate" | "beforeDelete" | "afterValidation" | "beforeCommit" | "afterCommit";
type HookFn<T extends Entity, C> = (entity: T, ctx: C) => MaybePromise<unknown>;

type AddReactionOpts = { runOnce?: boolean; name?: string };

/** A `guardTransition` rule, which also gets the transition it is checking, since the entity may have moved on. */
export type TransitionGuard<T extends Entity, V> = (
  entity: T,
  transition: Transition<V>,
) => MaybePromise<ValidationRuleResult>;

/** An `onTransition` function, which also gets the transition it is handling, since the entity may have moved on. */
type TransitionFn<T extends Entity, C, V> = (entity: T, ctx: C, transition: Transition<V>) => MaybePromise<unknown>;

/** The enum type of a transition field, i.e. `PublisherStatus`. */
type TransitionType<T extends Entity, K extends keyof FieldsOf<T>> = FieldsOf<T>[K] extends EntityField
  ? NonNullable<FieldsOf<T>[K]["type"]>
  : never;

/**
 * The state names that `transitions` tables and `match`es accept for an enum field, i.e. `"Draft"` for
 * `PublisherStatus.Draft`.
 *
 * We only accept the enum's accessors, not its codes or members, so every table reads the same way.
 */
type TransitionStates<T extends Entity, K extends keyof FieldsOf<T>> = FieldsOf<T>[K] extends {
  accessors: infer A extends string;
}
  ? A
  : never;

export const constraintNameToValidationError: Record<string, string> = {};

type Settable<T extends Entity> = keyof SettableFields<FieldsOf<T>> & string;

let booted = false;
let afterMetadataLocked = false;

/**
 * Called at the end of `configureMetadata` to indicate the boot process is complete.
 *
 * We use this flag to prevent users from mistakenly calling `config` methods after the boot
 * process is complete, i.e. from hooks or other post-boot invocations, where the calls are
 * not guaranteed to work because Joist's reactivity graph has already been initialized.
 */
export function setBooted(): void {
  booted = true;
}

export function setAfterMetadataLocked(): void {
  afterMetadataLocked = true;
}

/** The public API to configure an Entity's hooks & validation rules. */
export class ConfigApi<T extends Entity, C> {
  __data = new ConfigData<T, C>();

  /**
   * Maps a given `constraintName`, i.e. `authors_publisher_id_unique_index`, to a hard-coded-but-pretty validation errors.
   *
   * Note that the validationError must be hard-coded b/c we cannot tease out "which entity" caused a given
   * constraint failure from the SQL database. If you really need pretty-and-custom validation errors, you'll
   * need to check the constraint by hand ahead of time, before calling `em.flush`.
   */
  addConstraintMessage(constraintName: string, validationError: string) {
    this.ensurePreBoot(getCallerName(), "addConstraintMessage");
    constraintNameToValidationError[constraintName] = validationError;
  }

  /**
   * Maps a `RecursiveCycleError` on the given recursive collection field to a custom validation error.
   *
   * When a cycle is detected in a recursive collection (e.g. `parentsRecursive`), instead of
   * throwing a raw `RecursiveCycleError`, `em.flush` will convert it into a `ValidationErrors`
   * using the provided message function.
   *
   * The `messageFn` receives the entity that detected the cycle and the cycle path (array of
   * entities forming the cycle), and should return a validation error string.
   */
  addCycleRule(fieldName: string & keyof T, messageFn: (entity: T, cyclePath: Entity[]) => string) {
    this.ensurePreBoot(getCallerName(), "addCycleRule");
    this.__data.cycleMessages[fieldName] = messageFn;
    // Register a reactive rule that loads the recursive collection and catches cycle errors.
    // The rule uses the recursive collection's underlying relation as a reactive hint so it
    // triggers when the collection changes.
    const hint = fieldName as any;
    const fn = () => {
      // We don't actually need a try/catch/anything here, b/c if there is a cycle, it
      // will cause a CycleError during followReverseHint, and never even get to calling this fn.
    };
    this.__data.rules.push({ name: `addCycleRule(${getCallerName()})`, fn, hint });
  }

  /**
   * Adds a validation rule for this entity.
   *
   * If `hint` is passed, then the rule's lambda will be: 1) passed a view of the entity with only
   * the fields included in `hint` marked as accessible, and 2) the rule will be called reactively any
   * time any field in the `hint` changes.
   *
   * If lambdas want to access fields w/o having them marked for reactivity, the rule can either
   * include the field as readonly with a `:ro` suffix, i.e. `firstName:ro`, or the lambda can
   * access the `reacted.entity` property to get a full view of the entity's fields and methods.
   */
  addRule<H extends ReactiveHint<T>>(hint: H, rule: ValidationRule<Reacted<T, H>>): void;
  addRule(rule: ValidationRule<T>): void;
  addRule(ruleOrHint: ValidationRule<T> | any, maybeRule?: ValidationRule<any>): void {
    // Keep the name for easy debugging/tracing later
    const name = `addRule(${getCallerName()})`;
    this.ensurePreBoot(name, "addRule");
    pushValidationRule(this.__data.rules, name, ruleOrHint, maybeRule);
  }

  /**
   * Adds a "commit rule" that runs like a regular validation rule (see {@link addRule}), but *after*
   * the entity's `INSERT`/`UPDATE`/`DELETE` has been flushed to the database and *before* the
   * transaction `COMMIT`s, i.e. still within the transaction.
   *
   * The point of running this late is that any `em.find`s the rule makes will query the _changed_
   * state (the just-flushed rows), instead of the pre-flush state that regular `addRule` rules see.
   * This is useful for cross-row invariants that are easiest to express as a query, e.g. "at most
   * one active `AuthorSchedule` per author", where the rule wants to `em.find` the sibling rows
   * that were themselves just inserted/updated in this same flush.
   *
   * Like `addRule`, if a `hint` is passed the rule is reactive: it runs whenever any field in the
   * hint changes (walking back to the owning entity), and the lambda gets a `Reacted` view.
   */
  addCommitRule<H extends ReactiveHint<T>>(hint: H, rule: ValidationRule<Reacted<T, H>>): void;
  addCommitRule(rule: ValidationRule<T>): void;
  addCommitRule(ruleOrHint: ValidationRule<T> | any, maybeRule?: ValidationRule<any>): void {
    // Keep the name for easy debugging/tracing later
    const name = `addCommitRule(${getCallerName()})`;
    this.ensurePreBoot(name, "addCommitRule");
    pushValidationRule(this.__data.commitRules, name, ruleOrHint, maybeRule);
  }

  /** If both this entity, and `cstr` entities, are in the same `em.flush`, run us first. */
  runHooksBefore(cstr: EntityConstructor<any>): void {
    this.__data.runHooksBefore.push(cstr);
  }

  /** Deletes any entity/entities pointed to by `relation` when this entity is deleted. */
  cascadeDelete(relation: keyof RelationsIn<T> & LoadHint<T>): void {
    this.ensurePreBoot(getCallerName(), "cascadeDelete");
    this.__data.cascadeDeleteFields.push(relation);
  }

  touchOnChange(relation: keyof RelationsIn<T>): void {
    this.ensurePreBoot(getCallerName(), "touchOnChange");
    this.__data.touchOnChange.add(relation);
  }

  private addHook(hook: EntityHook, ruleOrHint: HookFn<T, C> | any, maybeFn?: HookFn<Loaded<T, any>, C>) {
    this.ensurePreBoot(getCallerName(), "addHook");
    if (typeof ruleOrHint === "function") {
      this.__data.hooks[hook].push(ruleOrHint);
    } else {
      const fn = async (entity: T, ctx: C) => {
        // TODO Use this for reactive beforeFlush
        const loaded = await entity.em.populate(entity, ruleOrHint);
        return maybeFn!(loaded, ctx);
      };
      // Squirrel our hint away where configureMetadata can find it
      (fn as any).hint = ruleOrHint;
      this.__data.hooks[hook].push(fn);
    }
  }

  afterMetadata(fn: AfterMetadataCallback<T>): void {
    if (afterMetadataLocked) {
      throw new Error(
        `config.afterMetadata on ${getCallerName()} must only be called on boot, before calling \`configureMetadata\` and not from other \`afterMetadata\` hooks.`,
      );
    }
    this.__data.afterMetadataCallbacks.push(fn);
  }

  beforeDelete<H extends LoadHint<T>>(populate: H, fn: HookFn<Loaded<T, H>, C>): void;
  beforeDelete(fn: HookFn<T, C>): void;
  beforeDelete(ruleOrHint: HookFn<T, C> | any, maybeFn?: HookFn<Loaded<T, any>, C>): void {
    this.addHook("beforeDelete", ruleOrHint, maybeFn);
  }

  beforeFlush<H extends LoadHint<T>>(populate: H, fn: HookFn<Loaded<T, H>, C>): void;
  beforeFlush(fn: HookFn<T, C>): void;
  beforeFlush(ruleOrHint: HookFn<T, C> | any, maybeFn?: HookFn<Loaded<T, any>, C>): void {
    this.addHook("beforeFlush", ruleOrHint, maybeFn);
  }

  // beforeCreate still needs to take a hint because even though the entity itself is New<T>, we might want to load
  // a nested relation that isn't loaded yet
  beforeCreate<H extends LoadHint<T>>(populate: H, fn: HookFn<Loaded<T, H>, C>): void;
  beforeCreate(fn: HookFn<T, C>): void;
  beforeCreate(ruleOrHint: HookFn<T, C> | any, maybeFn?: HookFn<Loaded<T, any>, C>): void {
    this.addHook("beforeCreate", ruleOrHint, maybeFn);
  }

  beforeUpdate<H extends LoadHint<T>>(populate: H, fn: HookFn<Loaded<T, H>, C>): void;
  beforeUpdate(fn: HookFn<T, C>): void;
  beforeUpdate(ruleOrHint: HookFn<T, C> | any, maybeFn?: HookFn<Loaded<T, any>, C>): void {
    this.addHook("beforeUpdate", ruleOrHint, maybeFn);
  }

  afterValidation<H extends LoadHint<T>>(populate: H, fn: HookFn<Loaded<T, H>, C>): void;
  afterValidation(fn: HookFn<T, C>): void;
  afterValidation(ruleOrHint: HookFn<T, C> | any, maybeFn?: HookFn<Loaded<T, any>, C>): void {
    this.addHook("afterValidation", ruleOrHint, maybeFn);
  }

  beforeCommit(fn: HookFn<T, C>): void {
    this.addHook("beforeCommit", fn);
  }

  afterCommit(fn: HookFn<T, C>): void {
    this.addHook("afterCommit", fn);
  }

  /**
   * Adds a reaction that runs during flush whenever fields in the `hint` change.
   *
   * Reactions are somewhere in between hooks and reactive fields/references:
   * 1. Can make arbitrary changes to any entity like a hook
   * 2. Only run when the provided hint has changes, not on every flush, like an RF/RR
   * 3. Run when the entity itself has no changes, like an RF/RF
   * 4. Can run multiple times per flush, like an RF/RF.  Be careful to avoid creating
   *    circular dependencies in the hint and to make the function idempotent.
   *
   * Names default to the registration's source location. Pass unique names when registering multiple
   * reactions from a shared helper or loop; duplicate names on the same config are rejected.
   *
   * @param hint The fields to watch for changes and load before running the reaction
   * @param fn The reaction function to run
   */
  addReaction<H extends ReactiveHint<T>>(hint: H, fn: HookFn<Loaded<T, H>, C>): void;
  /**
   * Adds a named reaction that runs during flush whenever fields in the `hint` change.
   *
   * Reactions are somewhere in between hooks and reactive fields/references:
   * 1. Can make arbitrary changes to any entity like a hook
   * 2. Only run when `hint` has changes, not on every flush, like an RF/RR
   * 3. Can run when the entity itself has no changes, like an RF/RF
   * 4. Can run multiple times per flush, like an RF/RF.  Be careful to avoid creating
   *    circular dependencies in the hint and to make the function idempotent.
   *
   * @param name A name to identify this reaction for debugging
   * @param hint The fields to watch for changes and load before running the reaction
   * @param fn The reaction function to run
   */
  addReaction<H extends ReactiveHint<T>>(name: string, hint: H, fn: HookFn<Loaded<T, H>, C>): void;
  /**
   * Adds a reaction that runs during flush whenever fields in the `hint` change.
   *
   * Reactions are somewhere in between hooks and reactive fields/references:
   * 1. Can make arbitrary changes to any entity like a hook
   * 2. Only run when `hint` has changes, not on every flush, like an RF/RR
   * 3. Can run when the entity itself has no changes, like an RF/RF
   * 4. Can run multiple times per flush, like an RF/RF.  Be careful to avoid creating
   *    circular dependencies in the hint and to make the function idempotent.
   *
   * @param opts Options object containing:
   *   - runOnce - If true, the reaction will only run once per flush, not every time the hint changes. Optional.
   *   default: false.
   *   - name - A name to identify this reaction for debugging
   * @param hint The fields to watch for changes and load before running the reaction
   * @param fn The reaction function to run
   */
  addReaction<H extends ReactiveHint<T>>(opts: AddReactionOpts, hint: H, fn: HookFn<Loaded<T, H>, C>): void;
  addReaction<H extends ReactiveHint<T>>(
    nameOrOptsOrHint: string | AddReactionOpts | H,
    hintOrFn: H | HookFn<Loaded<T, H>, C>,
    maybeFn?: HookFn<Loaded<T, H>, C>,
  ): void {
    // Keep the name so we can uniquely identify this reaction later and also aid debugging/tracing
    const fn = maybeFn ?? (hintOrFn as HookFn<Loaded<T, H>, C>);
    const hint = (maybeFn ? hintOrFn : nameOrOptsOrHint) as H;
    const opts = maybeFn
      ? typeof nameOrOptsOrHint === "string"
        ? { name: nameOrOptsOrHint }
        : (nameOrOptsOrHint as AddReactionOpts)
      : {};
    const { name = getCallerName(), runOnce = false } = opts;
    this.ensurePreBoot(name, "addReaction");
    this.ensureUniqueReactionName(name, "addReaction");
    // Cache load hints per-meta because CTI subtypes may resolve `hint` to different
    // load hints (e.g. an AsyncProperty overridden in the subtype with subtype-only relations).
    const loadHints = new Map<EntityMetadata, LoadHint<T>>();
    const wrappedFn = (entity: T, ctx: C) => {
      const meta = getMetadata(entity);
      let loadHint = loadHints.get(meta);
      if (loadHint === undefined) {
        loadHint = convertToLoadHint<T>(meta, hint);
        loadHints.set(meta, loadHint);
      }
      if (Object.keys(loadHint).length > 0) {
        return entity.em.populate(entity, loadHint).then((loaded) => fn(loaded as Loaded<T, H>, ctx));
      }
      return fn(entity as Loaded<T, H>, ctx);
    };
    this.__data.reactions.push({ name, fn: wrappedFn, hint, runOnce });
  }

  /**
   * Declares which state transitions of the enum `fieldName` are allowed, i.e. `{ Draft: ["Open"], Open: ["Closed"] }`.
   *
   * Keys and values are the enum's accessors as strings, i.e. `"Draft"` for `AuthorStatus.Draft`.
   *
   * A state that is missing from the table, or maps to `[]`, is treated as a terminal state & cannot be
   * changed. Creating an entity is not a transition, so a new entity may start in any state.
   *
   * The table is checked by the field's setter, so a disallowed transition throws a `ValidationErrors`
   * immediately, instead of failing the next `em.flush`.
   */
  transitions<K extends Settable<T>>(fieldName: K, table: TransitionTable<TransitionStates<T, K>>): void {
    const name = `transitions(${getCallerName()})`;
    this.ensurePreBoot(name, "transitions");
    this.__data.transitionFields.add(fieldName);
    // Convert accessors to codes on first use, since metadata isn't ready at config time.
    let allowed: Map<unknown, readonly unknown[]> | undefined;
    this.__data.transitionTables[fieldName] = (entity, from, to) => {
      allowed ??= toCodesTable(getMetadata(entity), fieldName, table);
      if (allowed.get(from)?.includes(to)) return undefined;
      return `Cannot change ${fieldName} from ${describeValue(entity, fieldName, from)} to ${describeValue(entity, fieldName, to)}`;
    };
  }

  /**
   * Checks each matching transition before its callbacks run, and rejects it if the guard returns an error.
   *
   * Use this for "a transition is allowed only when ..." checks that depend on other data, while
   * `transitions` declares the transitions that are possible at all. The `hint` is a load hint, like
   * `beforeFlush`'s, so it's loaded before `rule` runs, but only `fieldName` itself triggers the guard.
   *
   * Guards run during `em.flush`, for every matching transition since the last flush, even if the
   * field has moved on since. The entity is in its current state, so `rule` also gets the `transition`
   * it is checking. Guards never run on creation and are not rechecked during final validation.
   */
  guardTransition<K extends Settable<T>, H extends LoadHint<T>>(
    fieldName: K,
    match: GuardTransitionMatch<TransitionStates<T, K>>,
    hint: H,
    rule: TransitionGuard<Loaded<T, H>, TransitionType<T, K>>,
  ): void;
  guardTransition<K extends Settable<T>>(
    fieldName: K,
    match: GuardTransitionMatch<TransitionStates<T, K>>,
    rule: TransitionGuard<T, TransitionType<T, K>>,
  ): void;
  guardTransition(fieldName: string, match: GuardTransitionMatch<any>, hintOrRule: any, maybeRule?: any): void {
    const name = `guardTransition(${getCallerName()})`;
    this.ensurePreBoot(name, "guardTransition");
    this.__data.transitionFields.add(fieldName);
    const rule: TransitionGuard<T, any> = maybeRule ?? hintOrRule;
    const hint: LoadHint<T> | undefined = maybeRule ? hintOrRule : undefined;
    const matches = newMatcher(fieldName, match);
    const run = (entity: T, step: TransitionStep) => {
      const transition = toTransition(step);
      return hint === undefined
        ? rule(entity, transition)
        : entity.em.populate(entity, hint).then((loaded) => rule(loaded, transition));
    };
    // The dispatcher evaluates these guards once before invoking any callbacks for the transition.
    (this.__data.transitionRules[fieldName] ??= []).push((entity: T, step: TransitionStep) => {
      if (!matches(entity, step)) return;
      return run(entity, step);
    });
  }

  /**
   * Runs `fn` for each state transition of `fieldName` that matches `match`.
   *
   * This runs alongside reactions (see `addReaction`), but only state changes queue callbacks.
   * The `hint` is a load hint, like `beforeFlush`'s, so it is loaded but not reacted to.
   *
   * Reactions run during `em.flush`, once for every matching transition since the last flush, in order,
   * even if the field has moved on since. The entity is in its current state, so `fn` also gets the
   * `transition` it is handling. Transitions that a `guardTransition` rejects don't fire.
   *
   * Creating an entity with a matching `to` state fires too, unless `match.from` is set or
   * `match.onCreate` is `false`. Set `match.phase: "commit"` to run in `beforeCommit` instead, i.e.
   * for enqueueing jobs.
   *
   * Pass a unique name as the first argument when registering multiple callbacks from a shared
   * helper or loop. Duplicate names on the same config are rejected when registered.
   */
  onTransition<K extends Settable<T>, H extends LoadHint<T>>(
    fieldName: K,
    match: OnTransitionMatch<TransitionStates<T, K>>,
    hint: H,
    fn: TransitionFn<Loaded<T, H>, C, TransitionType<T, K>>,
  ): void;
  onTransition<K extends Settable<T>>(
    fieldName: K,
    match: OnTransitionMatch<TransitionStates<T, K>>,
    fn: TransitionFn<T, C, TransitionType<T, K>>,
  ): void;
  onTransition<K extends Settable<T>, H extends LoadHint<T>>(
    name: string,
    fieldName: K,
    match: OnTransitionMatch<TransitionStates<T, K>>,
    hint: H,
    fn: TransitionFn<Loaded<T, H>, C, TransitionType<T, K>>,
  ): void;
  onTransition<K extends Settable<T>>(
    name: string,
    fieldName: K,
    match: OnTransitionMatch<TransitionStates<T, K>>,
    fn: TransitionFn<T, C, TransitionType<T, K>>,
  ): void;
  onTransition(
    nameOrFieldName: string,
    fieldNameOrMatch: string | OnTransitionMatch<any>,
    matchOrHintOrFn: any,
    hintOrFn?: any,
    maybeFn?: any,
  ): void {
    const named = typeof fieldNameOrMatch === "string";
    const name = named ? nameOrFieldName : `onTransition(${getCallerName()})`;
    this.ensurePreBoot(name, "onTransition");
    this.ensureUniqueReactionName(name, "onTransition");

    // Resolve the overloads
    const fieldName = named ? fieldNameOrMatch : nameOrFieldName;
    const match: OnTransitionMatch<any> = named ? matchOrHintOrFn : fieldNameOrMatch;
    const hintOrCallback = named ? hintOrFn : matchOrHintOrFn;
    const callback = named ? maybeFn : hintOrFn;
    const fn: TransitionFn<T, C, any> = callback ?? hintOrCallback;
    const hint: LoadHint<T> | undefined = callback ? hintOrCallback : undefined;

    // Create the shared `run` function
    this.__data.transitionFields.add(fieldName);
    const matches = newMatcher(fieldName, match);
    const run = (entity: T, ctx: C, step: TransitionStep) => {
      const transition = toTransition(step);
      return hint === undefined
        ? fn(entity, ctx, transition)
        : entity.em.populate(entity, hint).then((loaded) => fn(loaded, ctx, transition));
    };

    // Transition queues trigger callbacks; hinted data is only loaded, not watched for changes.
    (this.__data.transitionCallbacks[fieldName] ??= []).push({ name, matches, run, phase: match.phase ?? "flush" });
  }

  /** Adds a synchronous default for `fieldName` to a hard-coded `value`. */
  setDefault<K extends Settable<T>, F = FieldsOf<T>[K]>(
    fieldName: K,
    // Allow returning undefined to mean "no default"
    value: F extends EntityField ? F["type"] : never,
  ): void;
  /** Adds a synchronous default for `fieldName` to the result of simple sync lambda. */
  setDefault<K extends Settable<T>, F = FieldsOf<T>[K]>(
    fieldName: K,
    // ...this doesn't technically declare what other fields of `entity` we depend on,
    // which ideally we want to drive "which default to set first?" precedence decisions.
    fn: (entity: T) => F extends EntityField ? F["type"] | undefined : never,
  ): void;
  /** Adds an asynchronous default for `fieldName` to the result of a hinted lambda. */
  setDefault<K extends Settable<T>, const H extends ReactiveHint<T>, F = FieldsOf<T>[K]>(
    fieldName: K,
    // We use a ReactiveHint so that we get field-level dependencies that means someday
    // we could drive "which default to set first?" precedence decisions.
    hint: H,
    fn: (
      entity: Reacted<T, H>,
      ctx: C,
    ) => F extends { kind: "m2o"; type: infer T extends Entity }
      ? MaybePromise<T | Reacted<T, {}> | undefined>
      : F extends EntityField
        ? MaybePromise<F["type"] | undefined>
        : never,
  ): void;
  setDefault<K extends keyof SettableFields<FieldsOf<T>> & string>(fieldName: K, hintOrFnOrValue: any, fn?: any): void {
    this.ensurePreBoot(getCallerName(), "setDefault");
    if (fn) {
      // If we're called once by the codegen, and again by the user, override the syncDefault
      delete this.__data.syncDefaults[fieldName];
      this.__data.asyncDefaults[fieldName] = new AsyncDefault(fieldName, hintOrFnOrValue, fn);
    } else {
      this.__data.syncDefaults[fieldName] = hintOrFnOrValue;
    }
  }

  /**
   * A noop method that exists solely to keep the `config.placeholder()` line in the initial entity file,
   * until the user is ready to use it. */
  placeholder(): void {}

  /** Requires unique names across ordinary reactions and transition callbacks. */
  private ensureUniqueReactionName(name: string, op: string): void {
    if (this.__data.reactionNames.has(name)) {
      throw new Error(
        `Duplicate reaction name "${name}" in config.${op}. Pass a unique name when registering reactions from a shared helper or loop.`,
      );
    }
    this.__data.reactionNames.add(name);
  }

  private ensurePreBoot(name: string, op: string): void {
    if (booted) {
      // Detect if this is NextJS and we're in a hot-reload situation
      if (isRunningInNextJs()) {
        // Reset our bag of config data to collect only the new rules/hooks
        this.__data = new ConfigData();
        resetBootFlag();
      } else {
        throw new Error(
          `config.${op} call on ${name} must only be called on boot, before calling \`configureMetadata\`.`,
        );
      }
    }
  }
}

function isRunningInNextJs(): boolean {
  return "__NEXT_HTTP_AGENT" in globalThis || "__NEXT_HTTPS_AGENT" in globalThis;
}

/**
 * Allows projects to manually reset the internal `booted` flag.
 *
 * This is only necessary if they're using hot-reloading and reloading their entity files
 * without restarting the server.
 *
 * Generally most tools like tsx or ts-node-dev reload the whole process, so don't need
 * to call this, but if Joist is used in a framework that does actual-hot-reloading, this
 * it will be necessary.
 */
export function resetBootFlag(): void {
  booted = false;
  afterMetadataLocked = false;
  resetConstructorMap();
}

/**
 * Stores a path back to a reactive rule.
 *
 * I.e. if `Book` has a `ruleFn` that reacts to `Author.title`, then `Author`'s config will have
 * a `ReactiveRule` with fields `["title"]`, path `books`, and rule `ruleFn`.
 */
export interface ReactiveRule {
  /** The source we're reacting to, specifically which base/subtype cstr. */
  source: MaybeAbstractEntityConstructor<any>;
  /** The fields on this source entity that would trigger the downstream rule's eval. */
  fields: string[];
  /** The constructor of downstream entity that owns the reactive rule. */
  cstr: MaybeAbstractEntityConstructor<any>;
  /** The name (source location) of the downstream reactive rule. */
  name: string;
  /** The path from this source entity to the downstream entity that needs evaled. */
  path: string[];
  /** The downstream validation rule to eval. */
  fn: ValidationRule<any>;
}

/**
 * Stores a path back to a reactive derived field.
 *
 * I.e. if `Book.displayName` is an `asyncField` that reacts to `Author.title`, then `Author`'s config will have
 * a `ReactiveFields` with fields `["title"]`, path `books`, and name `displayName`.
 */
export interface ReactiveField {
  kind: "populate" | "query";
  /** The fields on this source entity that would trigger the downstream field's recalc. */
  fields: string[];
  /** Read-only/immutable fields that are used in the derived field. */
  isReadOnly: boolean;
  /** The constructor of downstream entity that owns the derived field. */
  cstr: MaybeAbstractEntityConstructor<any>;
  /** The path from this source entity to the downstream entity that needs recalced. */
  path: string[];
  /** The name of the reactive field in the downstream entity to recalc. */
  name: string;
  runOnce: false;
}

export interface Reaction {
  kind: "reaction";
  /** The source we're reacting to, specifically which base/subtype cstr. */
  source: MaybeAbstractEntityConstructor<any>;
  /** The fields on this source entity that would trigger the downstream hook's eval. */
  fields: string[];
  /** Read-only/immutable fields that are used in the function. */
  isReadOnly: boolean;
  /** The constructor of downstream entity that owns the reaction. */
  cstr: MaybeAbstractEntityConstructor<any>;
  /** The name (source location) of the downstream reaction. */
  name: string;
  /** The path from this source entity to the downstream entity for this reaction. */
  path: string[];
  /** The downstream reaction function. */
  fn: HookFn<any, any>;
  /** If true, the reaction should only run once per flush, not every time the hint changes. */
  runOnce: boolean;
}

export type Reactable = ReactiveField | Reaction;

interface ReactionInternal<T extends Entity, H extends ReactiveHint<T>, C> {
  name: string;
  fn: HookFn<T, C>;
  hint: H;
  runOnce: boolean;
}

type AfterMetadataCallback<T extends Entity> = (meta: EntityMetadata<T>) => void;

/** The internal state of an entity's configuration data, i.e. validation rules/hooks. */
export class ConfigData<T extends Entity, C> {
  afterMetadataCallbacks: AfterMetadataCallback<T>[] = [];
  runHooksBefore: EntityConstructor<any>[] = [];
  /** The validation rules for this entity type. */
  rules: ValidationRuleInternal<T>[] = [];
  /** The "commit rules" for this entity type, i.e. validation rules that run post-flush/pre-commit. */
  commitRules: ValidationRuleInternal<T>[] = [];
  /** The reactions for this entity type. */
  reactions: ReactionInternal<T, any, C>[] = [];
  /** Names shared by addReaction and onTransition, including commit-phase callbacks. */
  reactionNames: Set<string> = new Set();
  /** Fields that have `transitions`, `guardTransition`, or `onTransition`s, i.e. so factories accept `withX` opts. */
  transitionFields: Set<string> = new Set();
  /** Field name -> the `transitions` table check, called by setters with the current and new values. */
  transitionTables: Record<string, (entity: T, from: unknown, to: unknown) => string | undefined> = {};
  /**
   * Field name -> guard wrappers, evaluated before a transition's callbacks.
   *
   * The dispatcher excludes creation; wrappers check matches before passing enum values to the guard.
   */
  transitionRules: Record<string, TransitionGuard<T, unknown>[]> = {};
  /** Field name -> callbacks dispatched after its transition guards pass. */
  transitionCallbacks: Record<string, TransitionCallback<T, C>[]> = {};
  /** The hooks for this entity type. */
  hooks: Record<EntityHook, HookFn<T, C>[]> = {
    beforeDelete: [],
    beforeFlush: [],
    beforeCreate: [],
    beforeUpdate: [],
    afterValidation: [],
    beforeCommit: [],
    afterCommit: [],
  };
  /** Synchronous defaults for this entity type, invoked on `em.create`. */
  syncDefaults: Record<string, ((entity: T) => void) | unknown> = {};
  /** Asynchronous defaults for this entity type, invoked on `em.flush`. */
  asyncDefaults: Record<string, AsyncDefault<T>> = {};

  // An array of the reactive rules that depend on this entity
  reactiveRules: ReactiveRule[] = [];
  // An array of the reactive *commit* rules (post-flush/pre-commit) that depend on this entity
  reactiveCommitRules: ReactiveRule[] = [];
  // An array of the reactive fields and reactions that depend on this entity
  reactables: Reactable[] = [];
  cascadeDeleteFields: Array<keyof RelationsIn<T>> = [];
  touchOnChange: Set<keyof RelationsIn<T>> = new Set();
  // Constantly converting reactive hints to load hints is expense, so cache them here
  cachedReactiveLoadHints: Record<string, any> = {};
  /** Maps recursive collection fieldNames to custom cycle error message functions. */
  cycleMessages: Record<string, (entity: T, cyclePath: Entity[]) => string> = {};
}

export function getCallerName(extraFrames: number = 0): string {
  const err = getStack();
  // E.g. at Object.<anonymous> (/home/stephen/homebound/graphql-service/src/entities/Activity.ts:86:8)
  // (Make sure to drop lines that don't start with 'at' b/c the stack format can differ
  // slightly i.e. if running via tsx/using a node loader (probably?)
  const line = err.stack!.split("\n").filter((line) => line.includes(" at "))[3 + extraFrames];
  const parts = line.split("/");
  // Get the last part, which will be the file name, i.e. Activity.ts:86:8
  return parts[parts.length - 1].replace(/:\d+\)?$/, "");
}

export function getFuzzyCallerName(): string {
  const err = getStack();
  const lines = err
    .stack!.split("\n")
    // E.g. at Object.<anonymous> (/home/stephen/homebound/graphql-service/src/entities/Activity.ts:86:8)
    .filter((line) => line.includes(" at "));
  const line = findUserCodeLine(lines);
  return getFilePath(line);
}

/**
 * Given a callstack line return the file name.
 *
 * I.e. `at Object.<anonymous> (/home/stephen/homebound/graphql-service/src/entities/Activity.ts:86:8)`
 */
export function getFilePath(line: string): string {
  const parts = line.split("/");
  return parts[parts.length - 1].replace(/:\d+\)?$/, ""); // Drop the `:8)`at the end
}

/** Given a callstack, uses heuristics to find the first line that looks like user code. */
export function findUserCodeLine(lines: string[]): string {
  return (
    lines.find((line) => {
      // When running Joist's own integration tests, if we ignore `/joist-orm/`, we'll end up ignoring
      // everything because `joist-orm` is the name of the repository/working copy itself.
      const withinWorkingCopyJoist = line.includes("/packages/orm/") || line.includes("/packages/core");
      // But once we're not in a working copy, assume any `/joist-orm/` in the path === internal orm stack frames
      const withinProductionJoist =
        !withinWorkingCopyJoist && (line.includes("/joist-orm/src/") || line.includes("/joist-core/src"));
      const nodeInternals = line.includes("node:internal/") || line.includes("Promise.all");
      const isUserCode = !withinWorkingCopyJoist && !withinProductionJoist && !nodeInternals;
      // const isRecalc = line.includes(".recalcPending");
      const isDefault = line.includes("/defaults.ts");
      // Batched calls like findOrCreate won't have a stack trace back to the true caller, so just stop there
      const isDataloader = line.includes("/dataloaders/");
      // If this is the `newTestInstance` call
      // What about:
      // recalcSynchronousDerivedFields
      return (
        (isDefault || isDataloader || isUserCode) &&
        !line.includes("Codegen.ts") &&
        // I wanted to exclude this, but it was actually our utils/entities.ts maybeSetDefault helper method
        // !line.includes("entities.ts") &&
        // Ignore loops in joist code like setOpts
        !line.includes("at Array") &&
        // Ignore the Author.ts constructor calling setOpts
        !line.includes("at new ")
      );
    }) ?? fail("Could not find caller name")
  );
}

const getStack: () => { stack?: string } = "captureStackTrace" in Error ? getStackFromCapture : getStackFromObject;

function getStackFromCapture(): { stack?: string } {
  const obj = {};
  Error.captureStackTrace(obj);
  return obj as any;
}

function getStackFromObject(): { stack?: string } {
  try {
    throw Error("");
  } catch (err) {
    return err as Error;
  }
}

/** Pushes a validation rule (either the raw or hinted/reactive form) onto `rules`, shared by `addRule`/`addCommitRule`. */
function pushValidationRule<T extends Entity>(
  rules: ValidationRuleInternal<T>[],
  name: string,
  ruleOrHint: ValidationRule<T> | any,
  maybeRule: ValidationRule<any> | undefined,
): void {
  if (typeof ruleOrHint === "function") {
    rules.push({ name, fn: ruleOrHint, hint: undefined });
  } else {
    const hint = ruleOrHint;
    // Cache load hints per-meta because CTI subtypes may resolve `hint` to different
    // load hints (e.g. an AsyncProperty overridden in the subtype with subtype-only relations).
    const loadHints = new Map<EntityMetadata, LoadHint<T>>();
    const fn = (entity: T) => {
      const meta = getMetadata(entity);
      let loadHint = loadHints.get(meta);
      if (loadHint === undefined) {
        loadHint = convertToLoadHint<T>(meta, hint);
        loadHints.set(meta, loadHint);
      }
      if (Object.keys(loadHint).length > 0) {
        return entity.em.populate(entity, loadHint).then(maybeRule!);
      }
      return maybeRule!(entity);
    };
    rules.push({ name, fn, hint });
  }
}

/** Uses the enum's display name in error messages when there is one, i.e. `Approved` instead of `APPROVED`. */
function describeValue(entity: Entity, fieldName: string, value: unknown): string {
  if (value === undefined) return "unset";
  const field = getMetadata(entity).allFields[fieldName];
  const details = field?.kind === "enum" ? (field.enumDetailType as any).getByCode?.(value) : undefined;
  return details?.name ?? String(value);
}

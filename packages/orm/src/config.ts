import { resetConstructorMap } from "./configure";
import { AsyncDefault } from "./defaults";
import { Entity } from "./Entity";
import {
  EntityConstructor,
  EntityField,
  EntityMetadata,
  fail,
  FieldsOf,
  getMetadata,
  Loaded,
  LoadHint,
  MaybeAbstractEntityConstructor,
  Reacted,
  ReactiveHint,
  RelationsIn,
  SettableFields,
} from "./index";
import { convertToLoadHint } from "./reactiveHints";
import { ValidationRule, ValidationRuleInternal } from "./rules";
import { MaybePromise } from "./utils";

export type EntityHook =
  | "beforeFlush"
  | "beforeCreate"
  | "beforeUpdate"
  | "beforeDelete"
  | "afterValidation"
  | "beforeCommit"
  | "afterCommit";
type HookFn<T extends Entity, C> = (entity: T, ctx: C) => MaybePromise<unknown>;

export const constraintNameToValidationError: Record<string, string> = {};

type Settable<T extends Entity> = keyof SettableFields<FieldsOf<T>> & string;

let booted = false;

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
    const name = getCallerName();
    this.ensurePreBoot(name, "addRule");
    if (typeof ruleOrHint === "function") {
      const fn = ruleOrHint;
      this.__data.rules.push({ name, fn, hint: undefined });
    } else {
      const hint = ruleOrHint;
      let loadHint: LoadHint<T>;
      // Create a wrapper around the user's function to populate
      const fn = (entity: T) => {
        // Ideally, we'd convert this outside `wrappedFn`, but we don't have `metadata` yet. So we do it lazily on the
        // first call.
        loadHint ??= convertToLoadHint<T>(getMetadata(entity), hint);
        if (Object.keys(loadHint).length > 0) {
          return entity.em.populate(entity, loadHint).then(maybeRule!);
        }
        return maybeRule!(entity);
      };
      this.__data.rules.push({ name, fn, hint });
    }
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
  addReaction<H extends ReactiveHint<T>>(
    nameOrHint: string | H,
    hintOrFn: H | HookFn<Loaded<T, H>, C>,
    maybeFn?: HookFn<Loaded<T, H>, C>,
  ): void {
    // Keep the name so we can uniquely identify this reaction later and also aid debugging/tracing
    const name = typeof maybeFn === "function" ? (nameOrHint as string) : getCallerName();
    const hint = (maybeFn ? hintOrFn : nameOrHint) as H;
    const fn = (maybeFn ?? hintOrFn) as HookFn<Loaded<T, H>, C>;
    this.ensurePreBoot(name, "addReaction");
    let loadHint: LoadHint<T>;
    // Create a wrapper around the user's function to populate
    const wrappedFn = (entity: T, ctx: C) => {
      // Ideally, we'd convert this outside `wrappedFn`, but we don't have `metadata` yet. So we do it lazily on the
      // first call.
      loadHint ??= convertToLoadHint<T>(getMetadata(entity), hint);
      if (Object.keys(loadHint).length > 0) {
        return entity.em.populate(entity, loadHint).then((loaded) => fn(loaded as Loaded<T, H>, ctx));
      }
      return fn(entity as Loaded<T, H>, ctx);
    };
    this.__data.reactions.push({ name, fn: wrappedFn, hint });
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

  private ensurePreBoot(name: string, op: string): void {
    if (booted) {
      // Detect if this is NextJS and we're in a hot-reload situation
      if (isRunningInNextJs()) {
        // Reset our bag of config data to collect only the new rules/hooks
        this.__data = new ConfigData();
        booted = false;
      } else {
        throw new Error(`config.${op} call ${name} must only be called on boot, before calling \`configureMetadata\`.`);
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
}

export type Reactable = ReactiveField | Reaction;

interface ReactionInternal<T extends Entity, H extends ReactiveHint<T>, C> {
  name: string;
  fn: HookFn<Reacted<T, H>, C>;
  hint: H;
}

type AfterMetadataCallback<T extends Entity> = (meta: EntityMetadata<T>) => void;

/** The internal state of an entity's configuration data, i.e. validation rules/hooks. */
export class ConfigData<T extends Entity, C> {
  afterMetadataCallbacks: AfterMetadataCallback<T>[] = [];
  runHooksBefore: EntityConstructor<any>[] = [];
  /** The validation rules for this entity type. */
  rules: ValidationRuleInternal<T>[] = [];
  /** The reactions for this entity type. */
  reactions: ReactionInternal<T, any, C>[] = [];
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
  // An array of the reactive fields and reactions that depend on this entity
  reactables: Reactable[] = [];
  cascadeDeleteFields: Array<keyof RelationsIn<T>> = [];
  touchOnChange: Set<keyof RelationsIn<T>> = new Set();
  // Constantly converting reactive hints to load hints is expense, so cache them here
  cachedReactiveLoadHints: Record<string, any> = {};
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
      const withinWorkingCopyJoist = line.includes("/packages/orm/");
      // But once we're not in a working copy, assume any `/joist-orm/` in the path === internal orm stack frames
      const withinProductionJoist = !withinWorkingCopyJoist && line.includes("/joist-orm/src/");
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

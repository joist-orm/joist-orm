import { Entity } from "./Entity";
import {
  getMetadata,
  Loaded,
  LoadHint,
  MaybeAbstractEntityConstructor,
  Reacted,
  ReactiveHint,
  RelationsIn,
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
  | "afterCommit";
type HookFn<T extends Entity, C> = (entity: T, ctx: C) => MaybePromise<void>;

export const constraintNameToValidationError: Record<string, string> = {};

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
    if (typeof ruleOrHint === "function") {
      const fn = ruleOrHint;
      this.__data.rules.push({ name, fn, hint: undefined });
    } else {
      const hint = ruleOrHint;
      // Create a wrapper around the user's function to populate
      const fn = (entity: T) => {
        // Ideally we'd convert this once outside `fn`, but we don't have `metadata` yet
        const loadHint = convertToLoadHint(getMetadata(entity), hint);
        if (Object.keys(loadHint).length > 0) {
          return entity.em.populate(entity, loadHint as any).then((loaded) => maybeRule!(loaded));
        }
        return maybeRule!(entity);
      };
      this.__data.rules.push({ name, fn, hint });
    }
  }

  /** Deletes any entity/entities pointed to by `relation` when this entity is deleted. */
  cascadeDelete(relation: keyof RelationsIn<T> & LoadHint<T>): void {
    this.__data.cascadeDeleteFields.push(relation);
  }

  private addHook(hook: EntityHook, ruleOrHint: HookFn<T, C> | any, maybeFn?: HookFn<Loaded<T, any>, C>) {
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

  afterCommit(fn: HookFn<T, C>): void {
    this.addHook("afterCommit", fn);
  }

  /**
   * A noop method that exists solely to keep the `config.placeholder()` line in the initial entity file,
   * until the user is ready to use it. */
  placeholder(): void {}
}

/**
 * Stores a path back to a reactive rule.
 *
 * I.e. if `Book` has a `ruleFn` that reacts to `Author.title`, then `Author`'s config will have
 * a `ReactiveRule` with fields `["title"]`, path `books`, and rule `ruleFn`.
 */
export interface ReactiveRule {
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
  /** The fields on this source entity that would trigger the downstream field's recalc. */
  fields: string[];
  /** The constructor of downstream entity that owns the derived field. */
  cstr: MaybeAbstractEntityConstructor<any>;
  /** The path from this source entity to the downstream entity that needs recalced. */
  path: string[];
  /** The name of the reactive field in the downstream entity to recalc. */
  name: string;
}

/** The internal state of an entity's configuration data, i.e. validation rules/hooks. */
export class ConfigData<T extends Entity, C> {
  /** The validation rules for this entity type. */
  rules: ValidationRuleInternal<T>[] = [];
  /** The hooks for this instance. */
  hooks: Record<EntityHook, HookFn<T, C>[]> = {
    beforeDelete: [],
    beforeFlush: [],
    beforeCreate: [],
    beforeUpdate: [],
    afterCommit: [],
    afterValidation: [],
  };
  // An array of the reactive rules that depend on this entity
  reactiveRules: ReactiveRule[] = [];
  // An array of the reactive fields that depend on this entity
  reactiveDerivedValues: ReactiveField[] = [];
  cascadeDeleteFields: Array<keyof RelationsIn<T>> = [];
  // Constantly converting reactive hints to load hints is expense, so cache them here
  cachedReactiveLoadHints: Record<string, any> = {};
}

// i.e. `Foo.ts:123:4`
const lineNumber = /s:\d+:\d+/;

function getCallerName(): string {
  const err = getErrorObject();
  // E.g. at Object.<anonymous> (/home/stephen/homebound/graphql-service/src/entities/Activity.ts:86:8)
  // (Make sure to drop lines that don't end with '...Foo.ts:123:3' b/c the stack format can differ
  // slightly i.e. if running via tsx/using a node loader (probably?)
  const line = err.stack!.split("\n").filter((line) => line.match(lineNumber))[3];
  const parts = line.split("/");
  // Get the last part, which will be the file name, i.e. Activity.ts:86:8
  return parts[parts.length - 1].replace(/:\d+\)?$/, "");
}

function getErrorObject(): Error {
  try {
    throw Error("");
  } catch (err) {
    return err as Error;
  }
}

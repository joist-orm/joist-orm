import { Entity } from "./Entity";
import { getMetadata, Loaded, LoadHint, Reacted, ReactiveHint, RelationsIn } from "./index";
import { convertToLoadHint } from "./reactiveHints";
import { AbstractRelationImpl } from "./relations/AbstractRelationImpl";
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

/** The public API to configure an Entity's hooks & validation rules. */
export class ConfigApi<T extends Entity, C> {
  __data = new ConfigData<T, C>();

  addRule<H extends ReactiveHint<T>>(hint: H, rule: ValidationRule<Reacted<T, H>>): void;
  addRule(rule: ValidationRule<T>): void;
  addRule(ruleOrHint: ValidationRule<T> | any, maybeRule?: ValidationRule<any>): void {
    // Keep the name for easy debugging/tracing later
    const name = getCallerName();
    if (typeof ruleOrHint === "function") {
      this.__data.rules.push({ name, fn: ruleOrHint, hint: undefined, fields: undefined });
    } else {
      // Create a wrapper around the user's function to populate
      const fn = async (entity: T) => {
        const loadHint = convertToLoadHint(getMetadata(entity), ruleOrHint);
        const loaded = await entity.em.populate(entity, loadHint);
        return maybeRule!(loaded);
      };
      this.__data.rules.push({ name, fn, hint: ruleOrHint, fields: [] });
    }
  }

  cascadeDelete(relationship: keyof RelationsIn<T> & LoadHint<T>): void {
    this.__data.cascadeDeleteFields.push(relationship);
    this.beforeDelete(relationship, (entity) => {
      const relation = entity[relationship] as any as AbstractRelationImpl<any>;
      relation.maybeCascadeDelete();
    });
  }

  /** Registers `fn` as the lambda to provide the async value for `key`. */
  setAsyncDerivedField<P extends keyof T, H extends LoadHint<T>>(
    key: P,
    populate: H,
    fn: (entity: Loaded<T, H>) => T[P],
  ): void {
    this.__data.asyncDerivedFields[key] = [populate, fn as any];
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
 * a `ReactiveRule` with fields `["title"]`, reversePath `books`, and rule `ruleFn`.
 */
interface ReactiveRule {
  name: string;
  fields: string[];
  reversePath: string[];
  rule: ValidationRule<any>;
}

/** The internal state of an entity's configuration data, i.e. validation rules/hooks. */
export class ConfigData<T extends Entity, C> {
  /** The validation rules for this entity type. */
  rules: ValidationRuleInternal<T>[] = [];
  /** The async derived fields for this entity type. */
  asyncDerivedFields: Partial<Record<keyof T, [LoadHint<T>, (entity: T) => any]>> = {};
  /** The hooks for this instance. */
  hooks: Record<EntityHook, HookFn<T, C>[]> = {
    beforeDelete: [],
    beforeFlush: [],
    beforeCreate: [],
    beforeUpdate: [],
    afterCommit: [],
    afterValidation: [],
  };
  // An array of my X fields, via reverse path, trigger some target entity+fn
  reactiveRules: ReactiveRule[] = [];
  // Load-hint-ish structures that point back to instances that depend on us for derived values.
  reactiveDerivedValues: string[][] = [];
  cascadeDeleteFields: Array<keyof RelationsIn<T>> = [];
}

function getCallerName(): string {
  const err = getErrorObject();
  // E.g. at Object.<anonymous> (/home/stephen/homebound/graphql-service/src/entities/Activity.ts:86:8)
  const line = err.stack!.split("\n")[4];
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

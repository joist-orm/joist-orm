import { AbstractRelationImpl } from "./collections/AbstractRelationImpl";
import {
  currentFlushSecret,
  Entity,
  EntityConstructor,
  EntityManager,
  EntityMetadata,
  EntityOrmField,
  getMetadata,
  IdOf,
  Loaded,
  LoadHint,
  MergedLoaded,
  OptsOf,
  RelationsIn,
} from "./EntityManager";
import { tagFromId } from "./keys";
import { reverseHint } from "./reverseHint";
import { fail } from "./utils";

export { newPgConnectionConfig } from "joist-utils";
export { BaseEntity } from "./BaseEntity";
export * from "./changes";
export * from "./collections";
export { DeepPartialOrNull } from "./createOrUpdatePartial";
export * from "./EntityManager";
export * from "./getProperties";
export * from "./keys";
export * from "./loadLens";
export * from "./newTestInstance";
export * from "./QueryBuilder";
export * from "./reverseHint";
export * from "./serde";
export { fail } from "./utils";

const F = Symbol();
const G = Symbol();
const H = Symbol();

/** A relationship from `T` to `U`, could be any of many-to-one, one-to-many, or many-to-many. */
export interface Relation<T extends Entity, U extends Entity> {
  // Make our Relation somewhat non-structural, otherwise since it's a marker interface,
  // types like `number` or `string` will match it. This also seems to nudge the type
  // inference inside of `LoadHint` to go beyond "this generic T of Entity has id and __orm"
  // to "no really this generic T has fields firstName, title, etc.".
  // See https://stackoverflow.com/questions/53448100/generic-type-of-extended-interface-not-inferred
  [F]?: T;
  [G]?: U;
}

/**
 * A many-to-one / foreign key from `T` to `U`, i.e. book to author.
 *
 * The `N` generic is for whether the field is optional (i.e. the foreign key column is
 * nullable). If it is optional, `N` will be `undefined`, which makes the return types
 * `U | undefined`. If it is not optional, `N` will be `never`, making the return types
 * `U | never` which becomes just `U`.
 */
export interface Reference<T extends Entity, U extends Entity, N extends never | undefined> extends Relation<T, U> {
  /** Returns the id of the current assigned entity, or `undefined` if the assigned entity has no id yet, or `undefined` if this column is nullable and currently unset. */
  id: IdOf<U> | undefined;

  /** Returns the id of the current assigned entity or a runtime error if it's either a) unset or b) set to a new entity that doesn't have an `id` yet. */
  idOrFail: IdOf<U>;

  idUntagged: string | undefined;

  idUntaggedOrFail: string;

  load(opts?: { withDeleted: boolean }): Promise<U | N>;

  set(other: U | N): void;

  /** Returns `true` if this relation is currently set (i.e. regardless of whether it's loaded, or if it is set but the assigned entity doesn't have an id saved. */
  isSet: boolean;

  [H]?: N;
}

/** Adds a known-safe `get` accessor. */
export interface LoadedReference<T extends Entity, U extends Entity, N extends never | undefined>
  extends Omit<Reference<T, U, N>, "id"> {
  // Since we've fetched the entity from the db, we're going to omit out the "| undefined" from Reference.id
  // which handles "this reference is set to a new entity" and just assume the id is there (or else N which
  // is for nullable references, which will just always be potentially `undefined`).
  //
  // Note that, similar to `.get`, this is _usually_ right, but if the user mutates the object graph after the
  // populate, i.e. they change some fields to have actually-new / not-included-in-the-`populate` call entities,
  // then these might turn into runtime errors. But the ergonomics are sufficiently better that it is worth it.
  id: IdOf<T> | N;

  getWithDeleted: U | N;
  get: U | N;
}

/** A collection of `U` within `T`, either one-to-many or many-to-many. */
export interface Collection<T extends Entity, U extends Entity> extends Relation<T, U> {
  load(opts?: { withDeleted: boolean }): Promise<ReadonlyArray<U>>;

  find(id: IdOf<U>): Promise<U | undefined>;

  add(other: U): void;

  remove(other: U): void;
}

/** Adds a known-safe `get` accessor. */
export interface LoadedCollection<T extends Entity, U extends Entity> extends Collection<T, U> {
  getWithDeleted: ReadonlyArray<U>;
  get: ReadonlyArray<U>;

  set(values: U[]): void;

  removeAll(): void;
}

// https://spin.atomicobject.com/2018/01/15/typescript-flexible-nominal-typing/
interface Flavoring<FlavorT> {
  _type?: FlavorT;
}
export type Flavor<T, FlavorT> = T & Flavoring<FlavorT>;

export function setField(entity: Entity, fieldName: string, newValue: any): boolean {
  ensureNotDeleted(entity, { ignore: "pending" });
  const em = getEm(entity);

  if (em.isFlushing) {
    const { flushSecret } = currentFlushSecret.getStore() || {};

    if (flushSecret === undefined) {
      throw new Error(`Cannot set '${fieldName}' on ${entity} during a flush outside of a entity hook`);
    }

    if (flushSecret !== em["flushSecret"]) {
      throw new Error(`Attempting to reuse a hook context outside its flush loop`);
    }
  }

  const { data, originalData } = entity.__orm;

  // "Un-dirty" our originalData if newValue is reverting to originalData
  if (fieldName in originalData) {
    if (equal(originalData[fieldName], newValue)) {
      data[fieldName] = newValue;
      delete originalData[fieldName];
      return true;
    }
  }

  // Push this logic into a field serde type abstraction?
  const currentValue = data[fieldName];
  if (equal(currentValue, newValue)) {
    return false;
  }

  // Only save the currentValue on the 1st change of this field
  if (!(fieldName in originalData)) {
    originalData[fieldName] = currentValue;
  }
  data[fieldName] = newValue;
  return true;
}

/**
 * Sets each value in `values` on the current entity.
 *
 * The default behavior is that passing a value as either `null` or `undefined` will set
 * the field as `undefined`, i.e. automatic `null` to `undefined` conversion.
 *
 * However, if you pass `ignoreUndefined: true`, then any opt that is `undefined` will be treated
 * as "do not set", and `null` will still mean "set to `undefined`". This is useful for implementing
 * APIs were an input of `undefined` means "do not set / noop" and `null` means "unset".
 */
export function setOpts<T extends Entity>(
  entity: T,
  values: Partial<OptsOf<T>> | string | undefined,
  opts?: { calledFromConstructor?: boolean; partial?: boolean },
): void {
  // If `values` is a string (i.e. the id), this instance is being hydrated from a database row, so skip all this.
  // If `values` is undefined, we're being called by `createPartial` that will do its own opt handling.
  if (values === undefined || typeof values === "string") {
    return;
  }
  const { calledFromConstructor, partial } = opts || {};
  const meta = getMetadata(entity);

  Object.entries(values as {}).forEach(([key, _value]) => {
    const field = meta.fields.find((f) => f.fieldName === key);
    if (!field) {
      throw new Error(`Unknown field ${key}`);
    }

    // If ignoreUndefined is set, we treat undefined as a noop
    if (partial && _value === undefined) {
      return;
    }
    // We let optional opts fields be `| null` for convenience, and convert to undefined.
    const value = _value === null || (typeof _value === "string" && _value.trim() === "") ? undefined : _value;
    const current = (entity as any)[key];
    if (current instanceof AbstractRelationImpl) {
      if (calledFromConstructor) {
        current.setFromOpts(value);
      } else if (partial && (field.kind === "o2m" || field.kind === "m2m")) {
        // For setPartial collections, we individually add/remove instead of set.
        const allowDelete = !field.otherMetadata().fields.some((f) => f.fieldName === "delete");
        const allowRemove = !field.otherMetadata().fields.some((f) => f.fieldName === "remove");
        (value as any[]).forEach((e) => {
          if (allowDelete && e.delete === true) {
            getEm(entity).delete(e);
          } else if (allowRemove && e.remove === true) {
            (current as any).remove(e);
          } else {
            (current as any).add(e);
          }
        });
      } else {
        current.set(value);
      }
    } else {
      (entity as any)[key] = value;
    }
  });
  if (calledFromConstructor) {
    getRelations(entity).forEach((v) => v.initializeForNewEntity());
  }
}

export function ensureNotDeleted(entity: Entity, opts: { ignore?: EntityOrmField["deleted"] } = {}): void {
  if (entity.isDeletedEntity && (opts.ignore === undefined || entity.__orm.deleted !== opts.ignore)) {
    throw new Error(`${entity} is marked as deleted`);
  }
}

/** Adds `null` to every key in `T` to accept partial-update-style input. */
export type PartialOrNull<T> = {
  [P in keyof T]?: T[P] | null;
};

export function getRequiredKeys<T extends Entity>(entity: T): string[];
export function getRequiredKeys<T extends Entity>(type: EntityConstructor<T>): string[];
export function getRequiredKeys<T extends Entity>(entityOrType: T | EntityConstructor<T>): string[] {
  return getMetadata(entityOrType as any)
    .fields.filter((f) => f.required)
    .map((f) => f.fieldName);
}

/** Entity validation errors; if `entity` is invalid, throw a `ValidationError`. */
export type ValidationRule<T extends Entity> = (
  entity: T,
) => MaybePromise<string | ValidationError | ValidationError[] | undefined>;

type MaybePromise<T> = T | PromiseLike<T>;

export type ValidationError = { entity: Entity; message: string };

export class ValidationErrors extends Error {
  constructor(public errors: ValidationError[]) {
    super(errorMessage(errors));
  }
}

export function newRequiredRule<T extends Entity>(key: keyof T): ValidationRule<T> {
  return (entity) => (entity.__orm.data[key] === undefined ? `${key} is required` : undefined);
}

function errorMessage(errors: ValidationError[]): string {
  if (errors.length === 1) {
    return `Validation error: ${errors[0].message}`;
  } else {
    return `Validation errors (${errors.length}): ${errors.map((e) => e.message).join(", ")}`;
  }
}

export type EntityHook =
  | "beforeFlush"
  | "beforeCreate"
  | "beforeUpdate"
  | "beforeDelete"
  | "afterValidation"
  | "afterCommit";
type HookFn<T extends Entity, C> = (entity: T, ctx: C) => MaybePromise<void>;

export type ReactiveEntityHook = "beforeFlush";

export class ConfigData<T extends Entity, C> {
  /** The validation rules for this entity type. */
  rules: ValidationRule<T>[] = [];
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
  reactiveHooks: Record<ReactiveEntityHook, [LoadHint<T>, LoadHint<T> | undefined, HookFn<T, C>][]> = {
    beforeFlush: [],
  };
  reversedHintsForReactiveHooks: string[][] = [];
  // Load-hint-ish structures that point back to instances that depend on us for validation rules.
  reactiveRules: string[][] = [];
  // Load-hint-ish structures that point back to instances that depend on us for derived values.
  reactiveDerivedValues: string[][] = [];
  cascadeDeleteFields: Array<keyof RelationsIn<T>> = [];
}

export class ConfigApi<T extends Entity, C> {
  __data = new ConfigData<T, C>();

  addRule<H extends LoadHint<T>>(populate: H, rule: ValidationRule<Loaded<T, H>>): void;
  addRule(rule: ValidationRule<T>): void;
  addRule(ruleOrHint: ValidationRule<T> | any, maybeRule?: ValidationRule<any>): void {
    if (typeof ruleOrHint === "function") {
      this.__data.rules.push(ruleOrHint);
    } else {
      const fn = async (entity: T) => {
        const em = getEm(entity);
        const loaded = await em.populate(entity, ruleOrHint);
        return maybeRule!(loaded);
      };
      // Squirrel our hint away where configureMetadata can find it
      (fn as any).hint = ruleOrHint;
      this.__data.rules.push(fn);
    }
  }

  cascadeDelete(relationship: keyof RelationsIn<T>): void {
    this.__data.cascadeDeleteFields.push(relationship);
    this.beforeDelete(relationship, (entity) => {
      const relation = (entity[relationship] as any) as AbstractRelationImpl<any>;
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
        const em = getEm(entity);
        const loaded = await em.populate(entity, ruleOrHint);
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

  private addReactiveHook<RH extends LoadHint<T>, PH extends LoadHint<T>>(
    hook: ReactiveEntityHook,
    reactTo: RH,
    populateOrFn: PH | HookFn<Loaded<T, RH>, C>,
    maybeFn?: HookFn<MergedLoaded<T, RH, PH>, C>,
  ) {
    const fn =
      typeof populateOrFn === "function"
        ? populateOrFn
        : async (entity: T, ctx: C) => {
            const em = getEm(entity);
            const loaded = await em.populate(entity, populateOrFn);
            return maybeFn!(loaded as any, ctx);
          };
    const populate = typeof populateOrFn !== "function" ? populateOrFn : undefined;
    this.__data.reactiveHooks[hook].push([reactTo, populate, fn as any]);
  }

  /*
   * Warning: Be very careful to only put entities that are absolutely necessary into the `reactTo` hint.
   * Careless use of this hint can result in a large number of queries and/or entities being loaded.  Entities that
   * don't need to be reacted to can simply be passed in the populate hint instead
   */
  reactiveBeforeFlush<RH extends LoadHint<T>, PH extends LoadHint<T>>(
    reactTo: RH,
    populate: PH,
    fn: HookFn<MergedLoaded<T, RH, PH>, C>,
  ): void;
  reactiveBeforeFlush<RH extends LoadHint<T>>(reactTo: RH, fn: HookFn<Loaded<T, RH>, C>): void;
  reactiveBeforeFlush<RH extends LoadHint<T>, PH extends LoadHint<T>>(
    reactTo: RH,
    populateOrFn: PH | HookFn<Loaded<T, RH>, C> | any,
    maybeFn?: HookFn<MergedLoaded<T, RH, PH>, C>,
  ): void {
    this.addReactiveHook("beforeFlush", reactTo, populateOrFn, maybeFn);
  }
}

const tagToConstructorMap = new Map<string, EntityConstructor<any>>();

/** Processes the metas based on any custom calls to the `configApi` hooks. */
export function configureMetadata(metas: EntityMetadata<any>[]): void {
  metas.forEach((meta) => {
    // Add each constructor into our tag -> constructor map for future lookups
    tagToConstructorMap.set(meta.tagName, meta.cstr);

    // Look for reactive validation rules to reverse
    meta.config.__data.rules.forEach((rule) => {
      if ((rule as any).hint) {
        const reversals = reverseHint(meta.cstr, (rule as any).hint);
        // For each reversal, tell its config about the reverse hint to force-re-validate
        // the original rule's instance any time it changes.
        reversals.forEach(([otherEntity, reverseHint]) => {
          getMetadata(otherEntity).config.__data.reactiveRules.push(reverseHint);
        });
      }
    });
    // Look for reactive async derived values rules to reverse
    Object.entries(meta.config.__data.asyncDerivedFields).forEach(([, entry]) => {
      const hint = entry![0];
      const reversals = reverseHint(meta.cstr, hint);
      reversals.forEach(([otherEntity, reverseHint]) => {
        getMetadata(otherEntity).config.__data.reactiveDerivedValues.push(reverseHint);
      });
    });
    // Look for reactive hooks to reverse
    Object.entries(meta.config.__data.reactiveHooks)
      .flatMap(([, hooks]) => hooks)
      .forEach((hook) => {
        const [hint] = hook;
        const reversals = reverseHint(meta.cstr, hint);
        // For each reversal, tell its config about the reverse hint to force-re-validate
        // the original rule's instance any time it changes.
        reversals.forEach(([otherEntity, reverseHint]) => {
          getMetadata(otherEntity).config.__data.reversedHintsForReactiveHooks.push(reverseHint);
        });
      });
  });
}

export function getEm(entity: Entity): EntityManager {
  return entity.__orm.em;
}

export function getRelations(entity: Entity): AbstractRelationImpl<any>[] {
  return Object.values(entity).filter((v) => v instanceof AbstractRelationImpl);
}

export function getConstructorFromTaggedId(id: string): EntityConstructor<any> {
  const tag = tagFromId(id);
  return tagToConstructorMap.get(tag) ?? fail(`Unknown tag: "${tag}" `);
}

function equal(a: any, b: any): boolean {
  return a === b || (a instanceof Date && b instanceof Date && a.getTime() == b.getTime());
}

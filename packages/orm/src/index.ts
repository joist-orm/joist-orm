import {
  Entity,
  EntityConstructor,
  EntityManager,
  EntityMetadata,
  getMetadata,
  IdOf,
  Loaded,
  LoadHint,
  OptsOf,
  RelationsIn,
} from "./EntityManager";
import { AbstractRelationImpl } from "./collections/AbstractRelationImpl";
import { reverseHint } from "./reverseHint";
import { OneToManyCollection } from "./collections/OneToManyCollection";
import { ManyToOneReference } from "./collections/ManyToOneReference";
import { ManyToManyCollection } from "./collections/ManyToManyCollection";
import { EntityOrmField } from "./EntityManager";

export * from "./EntityManager";
export * from "./serde";
export { newPgConnectionConfig } from "joist-utils";
export * from "./reverseHint";
export * from "./changes";
export * from "./contexty";
export { DeepPartialOrNull } from "./createOrUpdateUnsafe";
export { fail } from "./utils";
export { OneToManyCollection } from "./collections/OneToManyCollection";
export { ManyToOneReference } from "./collections/ManyToOneReference";
export { ManyToManyCollection } from "./collections/ManyToManyCollection";
export { OrderBy, EntityFilter, ValueFilter } from "./QueryBuilder";
export { BaseEntity } from "./BaseEntity";
export * from "./loadLens";

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

  load(): Promise<U | N>;

  set(other: U | N): void;

  /** Returns `true` if this relation is currently set (i.e. regardless of whether it's loaded, or if it is set but the assigned entity doesn't have an id saved. */
  isSet(): boolean;

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

  get: U | N;
}

/** A collection of `U` within `T`, either one-to-many or many-to-many. */
export interface Collection<T extends Entity, U extends Entity> extends Relation<T, U> {
  load(): Promise<ReadonlyArray<U>>;

  find(id: IdOf<U>): Promise<U | undefined>;

  add(other: U): void;

  remove(other: U): void;
}

/** Adds a known-safe `get` accessor. */
export interface LoadedCollection<T extends Entity, U extends Entity> extends Collection<T, U> {
  get: ReadonlyArray<U>;

  set(values: U[]): void;

  removeAll(): void;
}

// https://spin.atomicobject.com/2018/01/15/typescript-flexible-nominal-typing/
interface Flavoring<FlavorT> {
  _type?: FlavorT;
}
export type Flavor<T, FlavorT> = T & Flavoring<FlavorT>;

export function setField(entity: Entity, fieldName: string, newValue: any): void {
  ensureNotDeleted(entity, { ignore: "pending" });
  const em = getEm(entity);

  if (em.isFlushing) {
    const { flushSecret } = em.context;

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
    if (originalData[fieldName] === newValue) {
      data[fieldName] = newValue;
      delete originalData[fieldName];
      return;
    }
  }
  // Push this logic into a field serde type abstraction?
  const currentValue = data[fieldName];
  if (currentValue === newValue) {
    return;
  }
  // Only save the currentValue on the 1st change of this field
  if (!(fieldName in originalData)) {
    originalData[fieldName] = currentValue;
  }
  data[fieldName] = newValue;
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
  values: Partial<OptsOf<T>>,
  opts: { calledFromConstructor?: boolean; ignoreUndefined?: boolean },
): void {
  // If `values` is undefined, this instance is being hydrated from a database row, so skip all this.
  if (values === undefined) {
    return;
  }
  const requiredKeys = getRequiredKeys(entity);
  const { calledFromConstructor, ignoreUndefined } = opts;
  Object.entries(values as {}).forEach(([key, _value]) => {
    // If ignoreUndefined is set, we treat undefined as a noop
    if (ignoreUndefined && _value === undefined) {
      return;
    }
    // We let optional opts fields be `| null` for convenience, and convert to undefined.
    const value = _value === null ? undefined : _value;
    if (value === undefined && requiredKeys.includes(key)) {
      throw new Error(`${key} is required`);
    }
    const current = (entity as any)[key];
    if (current instanceof AbstractRelationImpl) {
      if (calledFromConstructor) {
        current.setFromOpts(value);
      } else {
        current.set(value);
      }
    } else {
      (entity as any)[key] = value;
    }
  });
  if (calledFromConstructor) {
    Object.values(entity).forEach((v) => {
      if (v instanceof AbstractRelationImpl) {
        v.initializeForNewEntity();
      }
    });
  }
}

export function ensureNotDeleted(entity: Entity, opts: { ignore?: EntityOrmField["deleted"] } = {}): void {
  if (entity.isDeletedEntity && (opts.ignore === undefined || entity.__orm.deleted !== opts.ignore)) {
    throw new Error(entity + " is marked as deleted");
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
  } else if (errors.length === 2) {
    return `Validation errors: ${errors.map((e) => e.message).join(", ")}`;
  } else {
    return `Validation errors (${errors.length})`;
  }
}

export type EntityHook = "beforeFlush" | "beforeDelete" | "afterCommit";
type HookFn<T extends Entity> = (entity: T) => MaybePromise<void>;

export class ConfigData<T extends Entity> {
  /** The validation rules for this entity type. */
  rules: ValidationRule<T>[] = [];
  /** The async derived fields for this entity type. */
  asyncDerivedFields: Partial<Record<keyof T, [LoadHint<T>, (entity: T) => any]>> = {};
  /** The hooks for this instance. */
  hooks: Record<EntityHook, HookFn<T>[]> = {
    beforeDelete: [],
    beforeFlush: [],
    afterCommit: [],
  };
  // Load-hint-ish structures that point back to instances that depend on us for validation rules.
  reactiveRules: string[][] = [];
  // Load-hint-ish structures that point back to instances that depend on us for derived values.
  reactiveDerivedValues: string[][] = [];
  cascadeDeleteFields: Array<keyof RelationsIn<T>> = [];
}

export class ConfigApi<T extends Entity> {
  __data = new ConfigData<T>();

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
      const relation = (entity[relationship] as any) as AbstractRelationImpl<T>;
      relation.onEntityDelete();
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

  private hook(hook: EntityHook, ruleOrHint: HookFn<T> | any, maybeFn?: HookFn<Loaded<T, any>>) {
    if (typeof ruleOrHint === "function") {
      this.__data.hooks[hook].push(ruleOrHint);
    } else {
      const fn = async (entity: T) => {
        // TODO Use this for reactive beforeFlush
        const em = getEm(entity);
        const loaded = await em.populate(entity, ruleOrHint);
        return maybeFn!(loaded);
      };
      // Squirrel our hint away where configureMetadata can find it
      (fn as any).hint = ruleOrHint;
      this.__data.hooks[hook].push(fn);
    }
  }

  beforeDelete<H extends LoadHint<T>>(populate: H, fn: HookFn<Loaded<T, H>>): void;
  beforeDelete(fn: HookFn<T>): void;
  beforeDelete(ruleOrHint: HookFn<T> | any, maybeFn?: HookFn<Loaded<T, any>>): void {
    this.hook("beforeDelete", ruleOrHint, maybeFn);
  }

  beforeFlush<H extends LoadHint<T>>(populate: H, fn: HookFn<Loaded<T, H>>): void;
  beforeFlush(fn: HookFn<T>): void;
  beforeFlush(ruleOrHint: HookFn<T> | any, maybeFn?: HookFn<Loaded<T, any>>): void {
    this.hook("beforeFlush", ruleOrHint, maybeFn);
  }

  afterCommit(fn: HookFn<T>): void {
    this.hook("afterCommit", fn);
  }
}

/** Processes the metas based on any custom calls to the `configApi` hooks. */
export function configureMetadata(metas: EntityMetadata<any>[]): void {
  metas.forEach((meta) => {
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
    Object.entries(meta.config.__data.asyncDerivedFields).forEach(([key, entry]) => {
      const hint = entry![0];
      const reversals = reverseHint(meta.cstr, hint);
      reversals.forEach(([otherEntity, reverseHint]) => {
        getMetadata(otherEntity).config.__data.reactiveDerivedValues.push(reverseHint);
      });
    });
  });
}

export function getEm(entity: Entity): EntityManager {
  return entity.__orm.em;
}

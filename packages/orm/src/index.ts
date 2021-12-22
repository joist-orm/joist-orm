import {
  currentFlushSecret,
  Entity,
  EntityConstructor,
  EntityManager,
  EntityMetadata,
  EntityOrmField,
  Field,
  getMetadata,
  Loaded,
  LoadHint,
  ManyToManyField,
  ManyToOneField,
  OneToManyField,
  OneToOneField,
  OptsOf,
  PolymorphicField,
  RelationsIn,
} from "./EntityManager";
import { maybeResolveReferenceToId, tagFromId } from "./keys";
import { Reference } from "./relations";
import { AbstractRelationImpl } from "./relations/AbstractRelationImpl";
import { reverseHint } from "./reverseHint";
import { fail } from "./utils";

export { newPgConnectionConfig } from "joist-utils";
export { BaseEntity } from "./BaseEntity";
export * from "./changes";
export { DeepPartialOrNull } from "./createOrUpdatePartial";
export * from "./drivers";
export * from "./EntityManager";
export * from "./getProperties";
export * from "./keys";
export * from "./loadLens";
export * from "./newTestInstance";
export * from "./QueryBuilder";
export * from "./relations";
export * from "./reverseHint";
export * from "./serde";
export { fail } from "./utils";

// https://spin.atomicobject.com/2018/01/15/typescript-flexible-nominal-typing/
interface Flavoring<FlavorT> {
  _type?: FlavorT;
}
export type Flavor<T, FlavorT> = T & Flavoring<FlavorT>;

export function setField<T extends Entity>(entity: T, fieldName: keyof T, newValue: any): boolean {
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
        const values = value as any[];

        // For setPartial collections, we used to individually add/remove instead of set, but this
        // incremental behavior was unintuitive for mutations, i.e. `parent.children = [b, c]` and
        // you'd still have `[a]` around. Note that we still support `delete: true` command to go
        // further than "remove from collection" to "actually delete the entity".
        const allowDelete = !field.otherMetadata().fields.some((f) => f.fieldName === "delete");
        const allowRemove = !field.otherMetadata().fields.some((f) => f.fieldName === "remove");

        // We're replacing the old `delete: true` / `remove: true` behavior with `op` (i.e. operation).
        // When passed in, all values must have it, and we kick into incremental mode, i.e. we
        // individually add/remove/delete entities.
        //
        // The old `delete: true / remove: true` behavior is deprecated, and should eventually blow up.
        const allowOp = !field.otherMetadata().fields.some((f) => f.fieldName === "op");
        const anyValueHasOp = allowOp && values.some((v) => !!v.op);
        if (anyValueHasOp) {
          const anyValueMissingOp = values.some((v) => !v.op);
          if (anyValueMissingOp) {
            throw new Error("If any child sets the `op` key, then all children must have the `op` key.");
          }
          values.forEach((v) => {
            if (v.op === "delete") {
              getEm(entity).delete(v);
            } else if (v.op === "remove") {
              (current as any).remove(v);
            } else if (v.op === "include") {
              (current as any).add(v);
            } else if (v.op === "incremental") {
              // This is a marker entry to opt-in to incremental behavior, just drop it
            }
          });
          return; // return from the op-based incremental behavior
        }

        const toSet: any[] = [];
        values.forEach((e) => {
          if (allowDelete && e.delete === true) {
            getEm(entity).delete(e);
          } else if (allowRemove && e.remove === true) {
            // Just leave out of `toSet`
          } else {
            toSet.push(e);
          }
        });
        current.set(toSet);
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
    fail(`${entity} is marked as deleted`);
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

/**
 * Return type of a `ValidationRule`.
 *
 * Consumers can extend `GenericError` to add fields relevant for their application.
 */
export type ValidationRuleResult<E extends GenericError> = string | E | E[] | undefined;

/** Entity validation errors; if `entity` is invalid, throw a `ValidationError`. */
export type ValidationRule<T extends Entity> = (entity: T) => MaybePromise<ValidationRuleResult<any>>;

type MaybePromise<T> = T | PromiseLike<T>;

/** A generic error which contains only a message field */
export type GenericError = { message: string };
/** An extension to GenericError which associates the error to a specific entity */
export type ValidationError = { entity: Entity } & GenericError;

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
    this.beforeDelete(relationship as any, (entity) => {
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
        const em = getEm(entity);
        const loaded = await em.populate(entity, ruleOrHint);
        return maybeFn!(loaded, ctx);
      };
      // Squirrel our hint away where configureMetadata can find it
      (fn as any).hint = ruleOrHint;
      this.__data.hooks[hook].push(fn);
    }
  }

  beforeDelete<H extends LoadHint<T>>(popuate: H, fn: HookFn<Loaded<T, H>, C>): void;
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

export function maybeGetConstructorFromReference(
  value: string | Entity | Reference<any, any, any> | undefined,
): EntityConstructor<any> | undefined {
  const id = maybeResolveReferenceToId(value);
  return id ? getConstructorFromTaggedId(id) : undefined;
}

function equal(a: any, b: any): boolean {
  return a === b || (a instanceof Date && b instanceof Date && a.getTime() == b.getTime());
}

export function isOneToManyField(ormField: Field): ormField is OneToManyField {
  return ormField.kind === "o2m";
}

export function isManyToOneField(ormField: Field): ormField is ManyToOneField {
  return ormField.kind === "m2o";
}

export function isManyToManyField(ormField: Field): ormField is ManyToManyField {
  return ormField.kind === "m2m";
}

export function isOneToOneField(ormField: Field): ormField is OneToOneField {
  return ormField.kind === "o2o";
}

export function isPolymorphicField(ormField: Field): ormField is PolymorphicField {
  return ormField.kind === "poly";
}

export function isReferenceField(ormField: Field): ormField is ManyToOneField | OneToOneField | PolymorphicField {
  return ormField.kind === "m2o" || ormField.kind === "o2o" || ormField.kind === "poly";
}

export function isCollectionField(ormField: Field): ormField is OneToManyField | ManyToManyField {
  return ormField.kind === "o2m" || ormField.kind === "m2m";
}

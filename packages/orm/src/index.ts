import { getInstanceData } from "./BaseEntity";
import { Entity } from "./Entity";
import { EntityConstructor, MaybeAbstractEntityConstructor, OptsOf } from "./EntityManager";
import { getBaseMeta, getMetadata } from "./EntityMetadata";
import { getDefaultDependencies, setSyncDefaults } from "./defaults";
import { getProperties } from "./getProperties";
import { New } from "./loadHints";
import { isAllSqlPaths } from "./loadLens";
import { isAsyncProperty, isReactiveField, isReactiveGetter, isReactiveQueryField } from "./relations";
import { AbstractRelationImpl } from "./relations/AbstractRelationImpl";
import { TimestampSerde } from "./serde";
import { fail } from "./utils";

export const testing = { isAllSqlPaths, getDefaultDependencies };
export { newPgConnectionConfig } from "joist-utils";
export { AliasAssigner } from "./AliasAssigner";
export * from "./Aliases";
export { BaseEntity, getInstanceData, setCurrentlyInstantiatingEntity } from "./BaseEntity";
export { Entity, IdType, isEntity } from "./Entity";
export * from "./EntityFields";
export * from "./EntityFilter";
export * from "./EntityGraphQLFilter";
export * from "./EntityManager";
export * from "./EntityMetadata";
export { EnumMetadata } from "./EnumMetadata";
export { EntityOrId, HintNode } from "./HintTree";
export { InstanceData } from "./InstanceData";
export * from "./QueryBuilder";
export * from "./QueryParser";
export * from "./changes";
export { ConfigApi, EntityHook, resetBootFlag } from "./config";
export { configureMetadata, getConstructorFromTaggedId, maybeGetConstructorFromReference } from "./configure";
export { createOrUpdatePartial, DeepPartialOrNull, updatePartial } from "./createOrUpdatePartial";
export * from "./drivers";
export { getField, isChangeableField, isFieldSet, setField } from "./fields";
export * from "./getProperties";
export * from "./json";
export * from "./keys";
export { kq, kqDot, kqStar } from "./keywords";
export {
  assertLoaded,
  DeepNew,
  ensureLoaded,
  isLoaded,
  isNew,
  Loadable,
  Loaded,
  LoadHint,
  MarkLoaded,
  maybePopulateThen,
  NestedLoadHint,
  New,
  RelationsIn,
} from "./loadHints";
export * from "./loadLens";
export { setFactoryWriter } from "./logging/FactoryLogger";
export * from "./logging/FieldLogger";
export { ReactionLogger, setReactionLogging } from "./logging/ReactionLogger";
export {
  defaultValue,
  FactoryEntityOpt,
  FactoryOpts,
  getTestIndex,
  maybeBranchValue,
  maybeNew,
  maybeNewPoly,
  newTestInstance,
  noValue,
  setFactoryLogging,
  testIndex,
} from "./newTestInstance";
export { deepNormalizeHint, normalizeHint } from "./normalizeHints";
export { JoinResult, PreloadHydrator, PreloadPlugin } from "./plugins/PreloadPlugin";
export { Reactable, Reacted, ReactiveHint, reverseReactiveHint } from "./reactiveHints";
export * from "./relations";
export {
  cannotBeUpdated,
  GenericError,
  maxValueRule,
  minValueRule,
  mustBeSubType,
  newRequiredRule,
  rangeValueRule,
  ValidationError,
  ValidationErrors,
  ValidationRule,
  ValidationRuleResult,
} from "./rules";
export * from "./serde";
export { asNew, assertNever, cleanStringValue, fail, indexBy } from "./utils";
export { ensureWithLoaded, WithLoaded, withLoaded } from "./withLoaded";

// https://spin.atomicobject.com/2018/01/15/typescript-flexible-nominal-typing/
interface Flavoring<FlavorT> {
  _type?: FlavorT;
}

export type Flavor<T, FlavorT> = T & Flavoring<FlavorT>;

/**
 * Sets each value in `values` on the current entity.
 *
 * The default behavior is that passing a value as either `null` or `undefined` will set
 * the field as `undefined`, i.e. automatic `null` to `undefined` conversion.
 *
 * However, if you pass `ignoreUndefined: true`, then any opt that is `undefined` will be treated
 * as "do not set", and `null` will still mean "set to `undefined`". This is useful for implementing
 * APIs were an input of `undefined` means "do not set / noop" and `null` means "unset".
 *
 * Note that constructors _always_ call this method, but if the call is coming from `em.hydrate`, we
 * use `values` being a primary key to short-circuit and let `hydrate` set the fields via the serde
 * `setOnEntity` methods.
 */
export function setOpts<T extends Entity>(
  entity: T,
  values: Partial<OptsOf<T>> | string | undefined,
  opts?: { calledFromConstructor?: boolean; partial?: boolean },
): void {
  const { calledFromConstructor, partial } = opts || {};

  // If `values` is a string (i.e. the id), this instance is being hydrated from a database row,
  // so skip all this, because `hydrate` manually calls `serde.setOnEntity`.
  if (typeof values === "string") return;

  // If `values` is undefined, we're being called by `createPartial` that will do its
  // own opt handling, but we still want the sync defaults applied after this opts handling.
  if (values !== undefined) {
    const meta = getMetadata(entity);
    Object.entries(values as {}).forEach(([key, _value]) => {
      const field = meta.allFields[key];
      if (!field) {
        // Allow setting non-field properties like fullName setters
        const prop = getProperties(meta)[key];
        if (!prop) {
          throw new Error(`Unknown field ${key}`);
        }
      }

      // If ignoreUndefined is set, we treat undefined as a noop
      if (partial && _value === undefined) {
        return;
      }
      // Ignore the STI discriminator, em.register will set this accordingly
      if (meta.inheritanceType === "sti" && getBaseMeta(meta).stiDiscriminatorField === key) {
        return;
      }
      // We let optional opts fields be `| null` for convenience, and convert to undefined.
      const value = _value === null ? undefined : _value;
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
          const allowDelete = !field.otherMetadata().fields["delete"];
          const allowRemove = !field.otherMetadata().fields["remove"];

          const meta = getBaseMeta(field.otherMetadata());
          const maybeSoftDelete = meta.timestampFields.deletedAt;

          // We're replacing the old `delete: true` / `remove: true` behavior with `op` (i.e. operation).
          // When passed in, all values must have it, and we kick into incremental mode, i.e. we
          // individually add/remove/delete entities.
          //
          // The old `delete: true / remove: true` behavior is deprecated, and should eventually blow up.
          const allowOp = !field.otherMetadata().fields["op"];
          const anyValueHasOp = allowOp && values.some((v) => !!v.op);
          if (anyValueHasOp) {
            const anyValueMissingOp = values.some((v) => !v.op);
            if (anyValueMissingOp) {
              throw new Error("If any child sets the `op` key, then all children must have the `op` key.");
            }
            values.forEach((v) => {
              if (v.op === "delete") {
                // We need to check if this is a soft-deletable entity, and if so, we will soft-delete it.
                if (maybeSoftDelete) {
                  const serde = meta.fields[maybeSoftDelete].serde as TimestampSerde<unknown>;
                  const now = new Date();
                  v.set({ [maybeSoftDelete]: serde.mapFromDate(now) });
                } else {
                  entity.em.delete(v);
                }
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
              // Delete the entity, but still include it in `toSet` so that `a1.books.getWithDeleted` will still see it.
              entity.em.delete(e);
              toSet.push(e);
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
      } else if (
        isAsyncProperty(current) ||
        isReactiveField(current) ||
        isReactiveGetter(current) ||
        isReactiveQueryField(current)
      ) {
        throw new Error(`Invalid argument, cannot set over ${key} ${current.constructor.name}`);
      } else {
        (entity as any)[key] = value;
      }
    });
  }

  // Apply any synchronous defaults, after the opts have been applied
  if (calledFromConstructor && !(entity.em as any).fakeInstance) {
    // If calledFromConstructor=true, this must be a new entity because we've got
    // an early-return up above that checks for `em.hydrate` passing in ids
    setSyncDefaults(entity);
  }
}

export function ensureNotDeleted(entity: Entity, ignore?: "pending"): void {
  if (entity.isDeletedEntity && (ignore === undefined || getInstanceData(entity).isDeletedAndFlushed)) {
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
  return Object.values(getMetadata(entityOrType as any).fields)
    .filter((f) => f.required)
    .map((f) => f.fieldName);
}

export function getRelations(entity: Entity): AbstractRelationImpl<any, any>[] {
  return Object.entries(getProperties(getMetadata(entity)))
    .filter(([, v]) => v instanceof AbstractRelationImpl)
    .map(([name]) => (entity as any)[name]);
}

export function getRelationEntries(entity: Entity): [string, AbstractRelationImpl<any, any>][] {
  return Object.entries(getProperties(getMetadata(entity)))
    .filter(([, v]) => v instanceof AbstractRelationImpl)
    .map(([name]) => [name, (entity as any)[name]]);
}

/** Casts a "maybe abstract" cstr to a concrete cstr when the calling code knows it's safe. */
export function asConcreteCstr<T extends Entity>(cstr: MaybeAbstractEntityConstructor<T>): EntityConstructor<T> {
  return cstr as any;
}

/**
 * Thrown when `.id` is accessed on an entity that does not have an id yet.
 *
 * For Postgres, entities are actually allowed to have ids pre-INSERT, if you call
 * `em.assignNewIds()`. Other databases typically require INSERTs to trigger the auto
 * id assignment.
 */
export class NoIdError extends Error {}

/** Throws a `NoIdError` for `entity`, i.e. because `id` was called before being saved. */
export function failNoIdYet(entity: string): never {
  throw new NoIdError(`${entity} has no id yet`);
}

/**
 * Add a static function since getters can't have type guards.
 *
 * See https://github.com/microsoft/TypeScript/issues/43368
 */
export function isNewEntity<T extends Entity>(entity: T): entity is New<T> {
  return entity.isNewEntity;
}

/**
 * Provides a container for entities to attach their application-specific types.
 */
export interface TypeMap {}

import { setSyncDefaults } from "./defaults";
import { Entity, EntityOrmField, isEntity } from "./Entity";
import {
  EntityConstructor,
  EntityManager,
  getEmInternalApi,
  MaybeAbstractEntityConstructor,
  OptsOf,
  TaggedId,
} from "./EntityManager";
import { EntityMetadata, getBaseAndSelfMetas, getMetadata } from "./EntityMetadata";
import { getFakeInstance, getProperties } from "./getProperties";
import { maybeResolveReferenceToId, tagFromId } from "./keys";
import { isAllSqlPaths } from "./loadLens";
import { convertToLoadHint, reverseReactiveHint } from "./reactiveHints";
import { Reference } from "./relations";
import { AbstractRelationImpl } from "./relations/AbstractRelationImpl";
import { PersistedAsyncPropertyImpl } from "./relations/PersistedAsyncProperty";
import { isCannotBeUpdatedRule } from "./rules";
import { fail } from "./utils";

export const testing = { isAllSqlPaths };
export { newPgConnectionConfig } from "joist-utils";
export { AliasAssigner } from "./AliasAssigner";
export * from "./Aliases";
export { BaseEntity } from "./BaseEntity";
export * from "./changes";
export { ConfigApi, EntityHook } from "./config";
export { DeepPartialOrNull } from "./createOrUpdatePartial";
export * from "./drivers";
export { Entity, EntityOrmField, IdType, isEntity } from "./Entity";
export * from "./EntityFields";
export * from "./EntityFilter";
export * from "./EntityGraphQLFilter";
export * from "./EntityManager";
export * from "./EntityMetadata";
export { EnumMetadata } from "./EnumMetadata";
export * from "./getProperties";
export { EntityOrId, HintNode } from "./HintTree";
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
export * from "./newTestInstance";
export { deepNormalizeHint, normalizeHint } from "./normalizeHints";
export { JoinResult, PreloadHydrator, PreloadPlugin } from "./plugins/PreloadPlugin";
export * from "./QueryBuilder";
export * from "./QueryParser";
export { Reactable, Reacted, ReactiveHint, reverseReactiveHint } from "./reactiveHints";
export * from "./relations";
export {
  cannotBeUpdated,
  GenericError,
  maxValueRule,
  minValueRule,
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
 * Returns the current value of `fieldName`, this is an internal method that should
 * only be called by the code-generated getters.
 *
 * We skip any typing like `fieldName: keyof T` because this method should only be
 * called by trusted codegen anyway.
 */
export function getField(entity: Entity, fieldName: string): any {
  return entity.__orm.data[fieldName];
}

/**
 * Sets the current value of `fieldName`, this is an internal method that should
 * only be called by the code-generated setters.
 *
 * We skip any typing like `fieldName: keyof T` because this method should only be
 * called by trusted codegen anyway.
 *
 * Returns `true` if the value was changed, or `false` if it was a noop.
 */
export function setField(entity: Entity, fieldName: string, newValue: any): boolean {
  ensureNotDeleted(entity, "pending");
  const { em } = entity;

  getEmInternalApi(em).checkWritesAllowed();

  const { data, originalData } = entity.__orm;

  // "Un-dirty" our originalData if newValue is reverting to originalData
  if (fieldName in originalData) {
    if (equalOrSameEntity(originalData[fieldName], newValue)) {
      data[fieldName] = newValue;
      delete originalData[fieldName];
      getEmInternalApi(em).rm.dequeueDownstreamReactiveFields(entity, fieldName);
      return true;
    }
  }

  // Push this logic into a field serde type abstraction?
  const currentValue = data[fieldName];
  if (equalOrSameEntity(currentValue, newValue)) {
    return false;
  }

  // Only save the currentValue on the 1st change of this field
  if (!(fieldName in originalData)) {
    originalData[fieldName] = currentValue;
  }
  getEmInternalApi(em).rm.queueDownstreamReactiveFields(entity, fieldName);
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
                entity.em.delete(v);
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
      } else {
        (entity as any)[key] = value;
      }
    });
  }

  // Apply any synchronous defaults, after the opts have been applied
  if (!(entity.em as any).fakeInstance) {
    setSyncDefaults(entity);
  }
}

export function ensureNotDeleted(entity: Entity, ignore?: EntityOrmField["deleted"]): void {
  if (entity.isDeletedEntity && (ignore === undefined || entity.__orm.deleted !== ignore)) {
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

const tagToConstructorMap = new Map<string, MaybeAbstractEntityConstructor<any>>();
const tableToMetaMap = new Map<string, EntityMetadata>();

/** Processes the metas for rules/reactivity based on the user's `config.*` calls. */
export function configureMetadata(metas: EntityMetadata[]): void {
  // Do a first pass to flag immutable fields (which we'll use in reverseReactiveHint)
  metas.forEach((meta) => {
    if (!meta.baseType) {
      // Add each constructor into our tag -> constructor map for future lookups
      tagToConstructorMap.set(meta.tagName, meta.cstr);
    }
    tableToMetaMap.set(meta.tableName, meta);
    // Scan rules for cannotBeUpdated so that we can set `field.immutable`
    meta.config.__data.rules.forEach((rule) => {
      if (isCannotBeUpdatedRule(rule.fn) && rule.fn.immutable) {
        const field = meta.fields[rule.fn.field];
        if (!field) {
          throw new Error(`Missing field '${rule.fn.field}' for cannotBeUpdated at ${rule.name}`);
        }
        field.immutable = true;
      }
    });
  });

  const metaByName = metas.reduce(
    (acc, m) => {
      acc[m.type] = m;
      return acc;
    },
    {} as Record<string, EntityMetadata>,
  );

  // Setup subTypes/baseTypes
  metas.forEach((m) => {
    // This is basically m.fields.mapValues to assign the primary alias
    m.allFields = Object.fromEntries(
      Object.entries(m.fields).map(([name, field]) => [name, { ...field, aliasSuffix: "" }]),
    );
    // Only supporting one level of inheritance for now, ideally would loop `while current !== null`
    if (m.baseType) {
      const b = metaByName[m.baseType];
      m.baseTypes.push(b);
      b.subTypes.push(m);
      // Add all the base's fields to our allFields, with the base's aliasSuffix, so that in
      // `WHERE` clauses for `small_publishers`, we'll have joined in `publishers` with an
      // alias + this alias suffix, so can `WHERE` on `${alias}_b0.name = 'foo'` and get
      // to the correct table.
      //
      // Note that we don't need to do this for subtypes, because `em.find` queries aren't
      // allowed to `WHERE` against columns in their subtypes. Maybe someday we can support
      // that like the GraphQL `...on SmallPublisher` syntax, like conditional/subtype-specific
      // clauses.
      Object.entries(b.fields).forEach(([name, field]) => {
        // We use `b0` because that is what addTablePerClassJoinsAndClassTag uses to join in the base table
        m.allFields[name] = { ...field, aliasSuffix: "_b0" };
      });
    }
  });

  // Now hook up our reactivity
  metas.forEach((meta) => {
    // Look for reactive validation rules to reverse
    meta.config.__data.rules.forEach(({ name, hint, fn }) => {
      if (hint) {
        const reversals = reverseReactiveHint(meta.cstr, meta.cstr, hint);
        // For each reversal, tell its config about the reverse hint to force-re-validate
        // the original rule's instance any time it changes.
        reversals.forEach(({ entity, path, fields }) => {
          getMetadata(entity).config.__data.reactiveRules.push({ cstr: meta.cstr, name, fields, path, fn });
        });
      }
    });

    // Look for reactive async derived values rules to reverse
    Object.values(meta.fields)
      .filter((f) => f.kind === "primitive" || (f.kind === "m2o" && f.derived === "async"))
      .forEach((field) => {
        const ap = (getFakeInstance(meta) as any)[field.fieldName] as
          | PersistedAsyncPropertyImpl<any, any, any>
          | undefined;
        // We might have an async property configured in joist-config.json that has not yet
        // been made a `hasPersistedAsyncProperty` in the entity file, so avoid continuing
        // if we don't actually have a property/loadHint available.
        if (ap?.reactiveHint) {
          // Cache the load hint so that we don't constantly re-calc it on instantiation.
          const loadHint = convertToLoadHint(meta, ap.reactiveHint);
          getBaseAndSelfMetas(meta).forEach(
            (m) => (m.config.__data.cachedReactiveLoadHints[field.fieldName] = loadHint),
          );

          const reversals = reverseReactiveHint(meta.cstr, meta.cstr, ap.reactiveHint);
          reversals.forEach(({ entity, path, fields }) => {
            getMetadata(entity).config.__data.reactiveDerivedValues.push({
              cstr: meta.cstr,
              name: field.fieldName,
              path,
              fields,
            });
          });
        }
      });
  });
}

export function getEm(entity: Entity): EntityManager<any> {
  return entity.em;
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

export function getConstructorFromTaggedId(id: TaggedId): MaybeAbstractEntityConstructor<any> {
  const tag = tagFromId(id);
  return tagToConstructorMap.get(tag) ?? fail(`Unknown tag: "${tag}" `);
}

export function getMetadataForTable(tableName: string): EntityMetadata {
  return tableToMetaMap.get(tableName) ?? fail(`Unknown table ${tableName}`);
}

export function maybeGetConstructorFromReference(
  value: string | Entity | Reference<any, any, any> | undefined,
): MaybeAbstractEntityConstructor<any> | undefined {
  const id = maybeResolveReferenceToId(value);
  return id ? getConstructorFromTaggedId(id) : undefined;
}

function equalOrSameEntity(a: any, b: any): boolean {
  return (
    equal(a, b) ||
    (Array.isArray(a) && Array.isArray(b) && equalArrays(a, b)) ||
    // This is kind of gross, but make sure not to compare two both-new entities
    (((isEntity(a) && !a.isNewEntity) || (isEntity(b) && !b.isNewEntity)) &&
      maybeResolveReferenceToId(a) === maybeResolveReferenceToId(b))
  );
}

function equalArrays(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((_: any, i) => equal(a[i], b[i]));
}

function equal(a: any, b: any): boolean {
  return a === b || (a instanceof Date && b instanceof Date && a.getTime() == b.getTime());
}

/** Casts a "maybe abstract" cstr to a concrete cstr when the calling code knows it's safe. */
export function asConcreteCstr<T extends Entity>(cstr: MaybeAbstractEntityConstructor<T>): EntityConstructor<T> {
  return cstr as any;
}

/**
 * Thrown when `.id` is accessed on an entity that does not have an id yet.
 *
 * For Postgres, entities are actually allowed to have ids pre-INSERT, if you call
 * `em.assignIds()`. Other databases typically require INSERTs to trigger the auto
 * id assignment.
 */
export class NoIdError extends Error {}

/** Throws a `NoIdError` for `entity`, i.e. because `id` was called before being saved. */
export function failNoIdYet(entity: string): never {
  throw new NoIdError(`${entity} has no id yet`);
}

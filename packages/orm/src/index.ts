import { Entity, EntityOrmField, isEntity } from "./Entity";
import { currentFlushSecret, EntityConstructor, EntityManager, OptsOf } from "./EntityManager";
import { EntityMetadata, getMetadata } from "./EntityMetadata";
import { maybeResolveReferenceToId, tagFromId } from "./keys";
import { Reference } from "./relations";
import { AbstractRelationImpl } from "./relations/AbstractRelationImpl";
import { reverseHint } from "./reverseHint";
import { isCannotBeUpdatedRule } from "./rules";
import { fail } from "./utils";

export { newPgConnectionConfig } from "joist-utils";
export { BaseEntity } from "./BaseEntity";
export * from "./changes";
export { ConfigApi, EntityHook } from "./config";
export { DeepPartialOrNull } from "./createOrUpdatePartial";
export * from "./drivers";
export { Entity, EntityOrmField, isEntity } from "./Entity";
export * from "./EntityManager";
export * from "./EntityMetadata";
export * from "./getProperties";
export * from "./keys";
export {
  DeepNew,
  ensureLoaded,
  ensureLoadedThen,
  isLoaded,
  isNew,
  Loadable,
  Loaded,
  LoadHint,
  New,
  Reactable,
  ReactiveHint,
  RelationsIn,
} from "./loaded";
export * from "./loadLens";
export * from "./newTestInstance";
export * from "./QueryBuilder";
export * from "./relations";
export * from "./reverseHint";
export {
  cannotBeUpdated,
  GenericError,
  newRequiredRule,
  ValidationError,
  ValidationErrors,
  ValidationRule,
  ValidationRuleResult,
} from "./rules";
export * from "./serde";
export { asNew, fail } from "./utils";

// https://spin.atomicobject.com/2018/01/15/typescript-flexible-nominal-typing/
interface Flavoring<FlavorT> {
  _type?: FlavorT;
}

export type Flavor<T, FlavorT> = T & Flavoring<FlavorT>;

export function setField<T extends Entity>(entity: T, fieldName: keyof T & string, newValue: any): boolean {
  ensureNotDeleted(entity, { ignore: "pending" });
  const { em } = entity;

  if (em.isFlushing) {
    const { flushSecret } = currentFlushSecret.getStore() || {};
    if (flushSecret === undefined) {
      throw new Error(
        `Cannot set '${fieldName}' on ${entity} during a flush outside of a entity hook or from afterCommit`,
      );
    }
    if (flushSecret !== em["flushSecret"]) {
      throw new Error(`Attempting to reuse a hook context outside its flush loop`);
    }
  }

  const { data, originalData } = entity.__orm;

  // "Un-dirty" our originalData if newValue is reverting to originalData
  if (fieldName in originalData) {
    if (equalOrSameEntity(originalData[fieldName], newValue)) {
      data[fieldName] = newValue;
      delete originalData[fieldName];
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
    const field = meta.fields[key];
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
            entity.em.delete(e);
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
  return Object.values(getMetadata(entityOrType as any).fields)
    .filter((f) => f.required)
    .map((f) => f.fieldName);
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
        reversals.forEach(({ entity, path }) => {
          getMetadata(entity).config.__data.reactiveRules.push({ fields: [], reversePath: path, rule });
        });
      }
      if (isCannotBeUpdatedRule(rule) && rule.immutable) {
        meta.fields[rule.field].immutable = true;
      }
    });
    // Look for reactive async derived values rules to reverse
    Object.entries(meta.config.__data.asyncDerivedFields).forEach(([, entry]) => {
      const hint = entry![0];
      const reversals = reverseHint(meta.cstr, hint);
      reversals.forEach(({ entity, path }) => {
        getMetadata(entity).config.__data.reactiveDerivedValues.push(path);
      });
    });
  });
}

export function getEm(entity: Entity): EntityManager<any> {
  return entity.em;
}

export function getRelations(entity: Entity): AbstractRelationImpl<any>[] {
  return Object.values(entity).filter((v: any) => v instanceof AbstractRelationImpl);
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

function equalOrSameEntity(a: any, b: any): boolean {
  return (
    equal(a, b) ||
    // This is kind of gross, but make sure not to compare two both-new entities
    (((isEntity(a) && !a.isNewEntity) || (isEntity(b) && !b.isNewEntity)) &&
      maybeResolveReferenceToId(a) === maybeResolveReferenceToId(b))
  );
}

function equal(a: any, b: any): boolean {
  return a === b || (a instanceof Date && b instanceof Date && a.getTime() == b.getTime());
}

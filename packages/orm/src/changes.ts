import { Entity, isEntity } from "./Entity";
import { IdOf, isId, OptsOf } from "./EntityManager";

/** Exposes a field's changed/original value in each entity's `this.changes` property. */
export interface FieldStatus<T> {
  /** True if the field has been changed on either create or update. */
  hasChanged: boolean;
  /** True only if the field has been updated i.e. not on the initial create. */
  hasUpdated: boolean;
  /** The original value, will be `undefined` if the entity new. */
  originalValue?: T;
}

/** Exposes a field's changed/original value in each entity's `this.changes` property. */
export interface ManyToOneFieldStatus<T extends Entity> extends FieldStatus<IdOf<T>> {
  /** The original entity, will be `undefined` if the entity new or the m2o was `null`. */
  originalEntity: Promise<T | undefined>;
}

type NullOrDefinedOr<T> = T | null | undefined;
type ExcludeNever<T> = Pick<T, { [P in keyof T]: T[P] extends never ? never : P }[keyof T]>;

/**
 * Creates the `this.changes.firstName` changes API for a given entity `T`.
 *
 * Specifically we use the fields from OptsOf but:
 *
 * - Exclude collections
 * - Convert entity types to id types to match what is stored in originalData
 */
export type Changes<T extends Entity> = { fields: (keyof OptsOf<T>)[] } & ExcludeNever<{
  [P in keyof OptsOf<T>]-?: OptsOf<T>[P] extends NullOrDefinedOr<infer U>
    ? U extends Array<infer E extends Entity>
      ? never
      : U extends (infer E extends Entity) | string
      ? ManyToOneFieldStatus<E>
      : FieldStatus<U>
    : never;
}>;

/**
 * A strongly-typed Entity with its changes field.
 *
 * Ideally this would live on `Entity` directly, but results in circular type issues.
 */
export interface EntityChanges<T extends Entity> {
  // Ideally we could use Record<keyof T, { hasChanged: boolean }> but we only want
  // keys that are actually columns. Right now OptsOf<T> has collections (not in .changed)
  // and OrderOf<T> has id/createdAt/updatedAt (also not in .changed), so just using an index
  // type for now.
  changes: Changes<T>;
}

export function newChangesProxy<T extends Entity>(entity: T): Changes<T> {
  return new Proxy(entity, {
    get(target, p: PropertyKey): FieldStatus<any> | ManyToOneFieldStatus<any> | (keyof OptsOf<T>)[] {
      if (p === "fields") {
        return (
          entity.isNewEntity ? Object.keys(entity.__orm.data) : Object.keys(entity.__orm.originalData)
        ) as (keyof OptsOf<T>)[];
      } else if (typeof p === "symbol") {
        throw new Error(`Unsupported call to ${String(p)}`);
      }

      const originalValue = entity.__orm.originalData[p];
      const hasChanged = (entity.isNewEntity && entity.__orm.data[p] !== undefined) || p in entity.__orm.originalData;
      const hasUpdated = !entity.isNewEntity && p in entity.__orm.originalData;
      return {
        hasChanged,
        hasUpdated,
        originalValue,
        get originalEntity() {
          if (isEntity(originalValue)) {
            return Promise.resolve(originalValue);
          } else if (isId(originalValue)) {
            return entity.em.load((entity as any)[p].otherMeta.cstr, originalValue);
          } else {
            return Promise.resolve();
          }
        },
      };
    },
  }) as any;
}

import { Entity, isEntity } from "./Entity";
import { FieldsOf, IdOf, isId, OptsOf } from "./EntityManager";
import { getConstructorFromTaggedId, maybeResolveReferenceToId } from "./index";

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

/**
 * Creates the `this.changes.firstName` changes API for a given entity `T`.
 *
 * We use `FieldsOf` because that already excludes collection, and then also
 * convert reference fields to `ManyToOneFieldStatus` to be the id type
 * because the reference may not be loaded.
 */
export type Changes<T extends Entity, K = keyof FieldsOf<T>> = { fields: K[] } & {
  [P in keyof FieldsOf<T>]: FieldsOf<T>[P] extends { type: infer U | undefined }
    ? U extends Entity
      ? ManyToOneFieldStatus<U>
      : FieldStatus<U>
    : never;
};

// type A1 = never extends string ? 1 : 2;
// type A2 = Book extends Entity | undefined ? 1 : 2;
// type A2a = string extends Entity | string | undefined ? 1 : 2;
// type A3 = Book | undefined extends Entity ? 1 : 2;
// type A4 = Book | undefined | null extends (infer E extends Entity) | undefined | null ? E : 2;

/**
 * A strongly-typed Entity with its changes field.
 *
 * Ideally this would live on `Entity` directly, but results in circular type issues.
 */
export interface EntityChanges<T extends Entity> {
  changes: Changes<T>;
}

export function newChangesProxy<T extends Entity>(entity: T): Changes<T> {
  return new Proxy(entity, {
    get(target, p: PropertyKey): FieldStatus<any> | ManyToOneFieldStatus<any> | (keyof OptsOf<T>)[] {
      if (p === "fields") {
        return (
          entity.isNewEntity
            ? // Cloning sometimes leaves unset keys in data as undefined, so drop them
              Object.entries(entity.__orm.data)
                .filter(([, value]) => value !== undefined)
                .map(([key]) => key)
            : Object.keys(entity.__orm.originalData)
        ) as (keyof OptsOf<T>)[];
      } else if (typeof p === "symbol") {
        throw new Error(`Unsupported call to ${String(p)}`);
      }

      // If `p` is in originalData, always respect that, even if it's undefined
      const originalValue = p in entity.__orm.originalData ? entity.__orm.originalData[p] : entity.__orm.data[p];
      const hasChanged = (entity.isNewEntity && entity.__orm.data[p] !== undefined) || p in entity.__orm.originalData;
      const hasUpdated = !entity.isNewEntity && p in entity.__orm.originalData;
      return {
        hasChanged,
        hasUpdated,
        get originalValue() {
          return maybeResolveReferenceToId(originalValue);
        },
        get originalEntity() {
          if (isEntity(originalValue)) {
            return Promise.resolve(originalValue);
          } else if (isId(originalValue)) {
            return entity.em.load(getConstructorFromTaggedId(originalValue), originalValue);
          } else {
            return Promise.resolve();
          }
        },
      };
    },
  }) as any;
}

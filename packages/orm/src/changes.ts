import { getOrmField } from "./BaseEntity";
import { Entity, isEntity } from "./Entity";
import { FieldsOf, IdOf, OptsOf, isId } from "./EntityManager";
import { getField, isChangeableField } from "./fields";
import { Field, getConstructorFromTaggedId, getMetadata } from "./index";

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
 *
 * @type K The fields of the entity, or potentially the union of the entity and its subtypes,
 *    i.e. `Publisher.changes` is typed as `Changes<Publisher, keyof Publisher | keyof SmallPub | keyof LargePub>`
 * @type R An optional list of restrictions, i.e for `Reacted` for to provide `changes` to its subset of fields.
 */
export type Changes<T extends Entity, K = keyof FieldsOf<T>, R = K> = { fields: K[] } & {
  [P in keyof FieldsOf<T> & R]: FieldsOf<T>[P] extends { type: infer U | undefined }
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
              Object.entries(getOrmField(entity).data)
                .filter(([, value]) => value !== undefined)
                .map(([key]) => key)
            : Object.keys(getOrmField(entity).originalData)
        ) as (keyof OptsOf<T>)[];
      } else if (typeof p === "symbol") {
        throw new Error(`Unsupported call to ${String(p)}`);
      }

      if (!isChangeableField(entity, p as any)) {
        throw new Error(`Invalid changes field ${p}`);
      }

      const { originalData, data } = getOrmField(entity);
      // If `p` is in originalData, always respect that, even if it's undefined
      const originalValue = p in originalData ? originalData[p] : getField(entity, p as any);
      // Use `__orm.data[p] !== undefined` instead of `p in entity.__orm.data` because if a new (or cloned) entity
      // sets-then-unsets a value, it will return to `undefined` but still be present in `__orm.data`.
      const hasChanged = entity.isNewEntity ? data[p] !== undefined : p in originalData;
      // const hasChanged = entity.isNewEntity ? p in entity.__orm.data : p in entity.__orm.originalData;
      const hasUpdated = !entity.isNewEntity && p in originalData;

      const fields = {
        hasChanged,
        hasUpdated,
        get originalValue() {
          // To be consistent whether a reference is loaded/unloaded, always coerce an entity to its id
          return isEntity(originalValue) ? originalValue.id : originalValue;
        },
      };

      // Only conditionally add `originalEntity` to avoid non-entities fields having a field that
      // a deep-cyclic formatter (like Jest) will blindly call and blow up.
      const meta = getMetadata(entity);
      if (meta && meta.allFields[p] && addOriginalEntity[meta.allFields[p].kind]) {
        Object.assign(fields, {
          get originalEntity() {
            if (isEntity(originalValue)) {
              return Promise.resolve(originalValue);
            } else if (isId(originalValue)) {
              return entity.em.load(getConstructorFromTaggedId(originalValue), originalValue);
            } else {
              return Promise.resolve();
            }
          },
        });
      }

      return fields;
    },
  }) as any;
}

const addOriginalEntity: Record<Field["kind"], boolean> = {
  m2o: true,
  poly: true,
  enum: false,
  lo2m: false,
  m2m: false,
  o2m: false,
  o2o: false,
  primaryKey: false,
  primitive: false,
};

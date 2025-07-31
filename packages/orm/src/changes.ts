import { getInstanceData } from "./BaseEntity";
import { Entity, isEntity } from "./Entity";
import { IdOf, isId } from "./EntityManager";
import { getField, isChangeableField } from "./fields";
import {
  Field,
  ManyToManyCollection,
  OneToManyCollection,
  RelationsOf,
  getConstructorFromTaggedId,
  getEmInternalApi,
  getMetadata,
} from "./index";
import { JoinRows } from "./JoinRows";
import { FieldsOf, OptsOf } from "./typeMap";

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

/** Provides access to a m2m relation's added/removed/changed/original values. */
export interface ManyToManyFieldStatus<U extends Entity> {
  added: U[];
  removed: U[];
  changed: U[];
  hasChanged: boolean;
  hasUpdated: boolean;
  originalEntities: Promise<readonly U[]>;
}

class ManyToManyFieldStatusImpl<T extends Entity, U extends Entity> implements ManyToManyFieldStatus<U> {
  readonly #entity: T;
  readonly #m2m: ManyToManyCollection<T, any>;
  readonly #joinRows: JoinRows;

  constructor(entity: T, fieldName: keyof T) {
    this.#entity = entity;
    this.#m2m = entity[fieldName] as ManyToManyCollection<T, any>;
    this.#joinRows = getEmInternalApi(entity.em).joinRows(this.#m2m);
  }

  // Similar to the o2m.added/removed methods, these don't have to be async because currently
  // any m2m mutation requires having both entities in-memory anyway, i.e. we can't do id-only/unloaded
  // mutation of m2m relations.
  get added(): U[] {
    return this.#joinRows.addedFor(this.#m2m, this.#entity).sort(entityCompare) as U[];
  }

  get removed(): U[] {
    return this.#joinRows.removedFor(this.#m2m, this.#entity).sort(entityCompare) as U[];
  }

  get changed(): U[] {
    return [
      // Append added & removed
      ...(this.#joinRows.addedFor(this.#m2m, this.#entity) as U[]),
      ...(this.#joinRows.removedFor(this.#m2m, this.#entity) as U[]),
    ].sort(entityCompare);
  }

  get hasChanged(): boolean {
    return this.changed.length > 0;
  }

  get hasUpdated(): boolean {
    return !this.#entity.isNewEntity && this.changed.length > 0;
  }

  get originalEntities(): Promise<readonly U[]> {
    return this.#m2m.load().then((list) => {
      const set = new Set(this.added);
      const copy = list.filter((e) => !set.has(e));
      copy.push(...this.removed);
      return copy.sort(entityCompare);
    });
  }
}

export interface OneToManyFieldStatus<U extends Entity> {
  added: U[];
  removed: U[];
  changed: U[];
  hasChanged: boolean;
  hasUpdated: boolean;
  originalEntities: Promise<readonly U[]>;
}

/** Provides access to an o2m relation's added/removed/changed entities. */
class OneToManyFieldStatusImpl<T extends Entity, U extends Entity> implements OneToManyFieldStatus<U> {
  readonly #entity: T;
  readonly #o2m: OneToManyCollection<T, U>;

  constructor(entity: T, fieldName: keyof T) {
    this.#entity = entity;
    this.#o2m = entity[fieldName] as OneToManyCollection<T, U>;
  }

  // This doesn't have to be a promise, b/c even if o2m is unloaded, to mutate
  // the o2m (calling `add(other)` or `remove(other)` or `other.otherField = me`), all
  // require having the "other entity" in memory.
  get added(): U[] {
    return [
      ...this.#o2m.added(),
      ...(this.#entity.isNewEntity
        ? []
        : ((getEmInternalApi(this.#entity.em).pendingChildren.get(this.#entity.idTagged)?.get(this.#o2m.fieldName)
            ?.adds as U[]) ?? [])),
    ].sort(entityCompare);
  }

  get removed(): U[] {
    return [
      ...this.#o2m.removed(),
      ...(this.#entity.isNewEntity
        ? []
        : ((getEmInternalApi(this.#entity.em).pendingChildren.get(this.#entity.idTagged)?.get(this.#o2m.fieldName)
            ?.removes as U[]) ?? [])),
    ].sort(entityCompare);
  }

  get changed(): U[] {
    return [...this.added, ...this.removed].sort(entityCompare);
  }

  get hasChanged(): boolean {
    // Calculating `changed: U[]` can be expensive if we sort, so just look at added/removed
    // ...except that these both sort as well
    return this.added.length > 0 || this.removed.length > 0;
  }

  get hasUpdated(): boolean {
    return !this.#entity.isNewEntity && this.hasChanged;
  }

  get originalEntities(): Promise<readonly U[]> {
    return this.#o2m.load().then((list) => {
      const set = new Set(this.added);
      const copy = list.filter((e) => !set.has(e));
      copy.push(...this.removed);
      return copy.sort(entityCompare);
    });
  }
}

/**
 * Creates the `this.changes.firstName` changes API for a given entity `T`.
 *
 * We use `FieldsOf` because that already excludes collection, and then also
 * convert reference fields to `ManyToOneFieldStatus` to be the id type
 * because the reference may not be loaded.
 *
 * @typeParam K The fields of the entity, or potentially the union of the entity and its subtypes,
 *    i.e. `Publisher.changes` is typed as `Changes<Publisher, keyof Publisher | keyof SmallPub | keyof LargePub>`
 * @typeParam R An optional list of restrictions, i.e for `Reacted` for to provide `changes` to its subset of fields.
 */
export type Changes<T extends Entity, K = keyof (FieldsOf<T> & RelationsOf<T>), R = K> = {
  /** Array of changed field names. */
  fields: NonNullable<K>[];
  /** Array of changed field names w/o o2m & m2m relations (which can be expensive). */
  fieldsWithoutRelations: NonNullable<K>[];
} & {
  [P in keyof FieldsOf<T> & R]: FieldsOf<T>[P] extends { kind: "m2m"; type: infer U extends Entity }
    ? ManyToManyFieldStatus<U>
    : FieldsOf<T>[P] extends { kind: "o2m"; type: infer U extends Entity }
      ? OneToManyFieldStatus<U>
      : FieldsOf<T>[P] extends { type: infer U | undefined }
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
    get(
      target,
      p: PropertyKey,
    ):
      | FieldStatus<any>
      | ManyToOneFieldStatus<any>
      | ManyToManyFieldStatus<any>
      | OneToManyFieldStatus<any>
      | (keyof OptsOf<T>)[] {
      if (p === "fields") {
        return getChangedFieldNames(entity, true);
      } else if (p === "fieldsWithoutRelations") {
        return getChangedFieldNames(entity, false);
      } else if (typeof p === "symbol") {
        throw new Error(`Unsupported call to ${String(p)}`);
      } else if (getMetadata(entity).allFields[p]?.kind === "m2m") {
        return new ManyToManyFieldStatusImpl(entity, p as keyof T);
      } else if (getMetadata(entity).allFields[p]?.kind === "o2m") {
        return new OneToManyFieldStatusImpl(entity, p as keyof T);
      } else if (!isChangeableField(entity, p as any)) {
        throw new Error(`Invalid changes field ${p}`);
      }

      const { originalData, data } = getInstanceData(entity);
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

/** Scans `entity` for changes primitive + m2m/o2m fields. */
function getChangedFieldNames<T extends Entity>(entity: T, includeRelations: boolean): (keyof OptsOf<T>)[] {
  const fieldsChanged = entity.isNewEntity
    ? // Cloning sometimes leaves unset keys in data as undefined, so drop them
      Object.entries(getInstanceData(entity).data)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key)
    : Object.keys(getInstanceData(entity).originalData);

  // Calling `hasChanged` on these can be expensive, and we call this in a loop during em.flush
  if (includeRelations) {
    for (const field of Object.values(getMetadata(entity).allFields)) {
      if (field.kind === "m2m") {
        const status = new ManyToManyFieldStatusImpl(entity, field.fieldName as keyof T);
        if (status.hasChanged) {
          fieldsChanged.push(field.fieldName);
        }
      } else if (field.kind === "o2m") {
        const status = new OneToManyFieldStatusImpl(entity, field.fieldName as keyof T);
        if (status.hasChanged) {
          fieldsChanged.push(field.fieldName);
        }
      }
    }
  }

  return fieldsChanged as any;
}

const entityCompare: (a: Entity, b: Entity) => number = (a, b) => {
  return a.toString().localeCompare(b.toString());
};

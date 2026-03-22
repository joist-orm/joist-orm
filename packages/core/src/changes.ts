import { getInstanceData } from "./BaseEntity";
import { Entity } from "./Entity";
import { IdOf } from "./EntityManager";
import { getField, isChangeableField } from "./fields";
import {
  Field,
  ManyToManyCollection,
  OneToManyCollection,
  RelationsOf,
  assertNever,
  getEmInternalApi,
  getMetadata,
  isEntity,
  isId,
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

/**
 * Provides a base class for field/primitive & m2o status impls.
 *
 * We use a separate base class so that the primitive & m2o subtypes can have their own
 * `kind: ...` consts, that if the m2o just subtyped the primitive directly, wouldn't be
 * allowed.
 */
abstract class BaseFieldStatusImpl<T> {
  entity: Entity;
  fieldName: string;

  constructor(entity: Entity, fieldName: string) {
    this.entity = entity;
    this.fieldName = fieldName;
  }

  get originalValue(): T | undefined {
    const { originalData, data } = getInstanceData(this.entity);
    // If `p` is in originalData, always respect that, even if it's undefined
    return this.fieldName in originalData ? originalData[this.fieldName] : getField(this.entity, this.fieldName as any);
  }

  get hasChanged(): boolean {
    const { originalData, data } = getInstanceData(this.entity);
    // Use `__orm.data[p] !== undefined` instead of `p in entity.__orm.data` because if a new (or cloned) entity
    // sets-then-unsets a value, it will return to `undefined` but still be present in `__orm.data`.
    return this.entity.isNewEntity ? data[this.fieldName] !== undefined : this.fieldName in originalData;
  }

  get hasUpdated(): boolean {
    const { originalData } = getInstanceData(this.entity);
    return !this.entity.isNewEntity && this.fieldName in originalData;
  }
}

/** Field status for primitive, enum, & primary key columns. */
export interface PrimitiveFieldStatus<T> extends FieldStatus<T> {
  kind: "field";
}

/** Implements the primitive field status, by extend base & just adding our `kind` const. */
class PrimitiveFieldStatusImpl<T> extends BaseFieldStatusImpl<T> implements PrimitiveFieldStatus<T> {
  kind = "field" as const;
}

/** Implements the m2o field status, by extend base, & adding `originalEntity`. */
class ManyToOneFieldStatusImpl<T extends Entity>
  extends BaseFieldStatusImpl<IdOf<T>>
  implements ManyToOneFieldStatus<T>
{
  kind = "m2o" as const;

  /**
   * Returns our original entity's `id`.
   *
   * We can know `originalValue` has an `id` available (i.e. is not new), b/c original values defacto
   * came from the database.
   *
   * We also return the id so that `entity.changes.m2oField.originalValue` has a consistent API,
   * regardless of whether the `entity.m2oField` itself is loaded or unloaded.
   */
  get originalValue() {
    const originalValue = super.originalValue;
    return isEntity(originalValue) ? (originalValue.id as IdOf<T>) : originalValue;
  }

  /** Returns the original entity instance, which may not be loaded into memory yet, or undefined. */
  get originalEntity(): Promise<T | undefined> {
    const originalValue = this.originalValue;
    if (isEntity(originalValue)) {
      return Promise.resolve(originalValue as T);
    } else if (isId(originalValue)) {
      return this.entity.em.load(originalValue) as Promise<T>;
    } else {
      return Promise.resolve(undefined);
    }
  }
}

/** Provides a m2o/reference field's changed/original value in the entity's `this.changes` property. */
export interface ManyToOneFieldStatus<T extends Entity> extends FieldStatus<IdOf<T>> {
  kind: "m2o";
  /** The original entity, will be `undefined` if the entity new or the m2o was `null`. */
  originalEntity: Promise<T | undefined>;
}

/** Provides a m2m relation's added/removed/changed/original values. */
export interface ManyToManyFieldStatus<U extends Entity> {
  kind: "m2m";
  added: U[];
  removed: U[];
  changed: U[];
  hasChanged: boolean;
  hasUpdated: boolean;
  originalEntities: Promise<readonly U[]>;
}

class ManyToManyFieldStatusImpl<T extends Entity, U extends Entity> implements ManyToManyFieldStatus<U> {
  readonly kind = "m2m";
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
    return this.#added.sort(entityCompare);
  }

  get removed(): U[] {
    return this.#removed.sort(entityCompare);
  }

  get changed(): U[] {
    return [...this.#added, ...this.#removed].sort(entityCompare);
  }

  get hasChanged(): boolean {
    // Calculating `changed: U[]` can be expensive if we sort, so just look at added/removed
    return this.#added.length > 0 || this.#removed.length > 0;
  }

  get hasUpdated(): boolean {
    return !this.#entity.isNewEntity && this.hasChanged;
  }

  get originalEntities(): Promise<readonly U[]> {
    return this.#m2m.load().then((list) => {
      const set = new Set(this.added);
      const copy = list.filter((e) => !set.has(e));
      copy.push(...this.removed);
      return copy.sort(entityCompare);
    });
  }

  get #added(): U[] {
    return this.#joinRows.addedFor(this.#m2m, this.#entity) as U[];
  }

  get #removed(): U[] {
    return this.#joinRows.removedFor(this.#m2m, this.#entity) as U[];
  }
}

export interface OneToManyFieldStatus<U extends Entity> {
  kind: "o2m";
  added: U[];
  removed: U[];
  changed: U[];
  hasChanged: boolean;
  hasUpdated: boolean;
  originalEntities: Promise<readonly U[]>;
}

/** Provides access to an o2m relation's added/removed/changed entities. */
class OneToManyFieldStatusImpl<T extends Entity, U extends Entity> implements OneToManyFieldStatus<U> {
  readonly kind = "o2m";
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
    return this.#added.sort(entityCompare);
  }

  get removed(): U[] {
    return this.#removed.sort(entityCompare);
  }

  get changed(): U[] {
    return [...this.added, ...this.removed].sort(entityCompare);
  }

  get hasChanged(): boolean {
    // Calculating `changed: U[]` can be expensive if we sort, so just look at added/removed
    return this.#added.length > 0 || this.#removed.length > 0;
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

  // This doesn't have to be a promise, b/c even if o2m is unloaded, to mutate
  // the o2m (calling `add(other)` or `remove(other)` or `other.otherField = me`), all
  // require having the "other entity" in memory.
  get #added(): U[] {
    return [
      ...this.#o2m.added(),
      ...(this.#entity.isNewEntity
        ? []
        : ((getEmInternalApi(this.#entity.em).pendingPercolate.get(this.#entity.idTagged)?.get(this.#o2m.fieldName)
            ?.adds as U[]) ?? [])),
    ];
  }

  get #removed(): U[] {
    return [
      ...this.#o2m.removed(),
      ...(this.#entity.isNewEntity
        ? []
        : ((getEmInternalApi(this.#entity.em).pendingPercolate.get(this.#entity.idTagged)?.get(this.#o2m.fieldName)
            ?.removes as U[]) ?? [])),
    ];
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
          : PrimitiveFieldStatus<U>
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
      p: PropertyKey & string,
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
      }
      const kind = getMetadata(entity).allFields[p]?.kind;
      if (kind === "m2m") {
        return new ManyToManyFieldStatusImpl(entity, p as keyof T);
      } else if (kind === "o2m") {
        return new OneToManyFieldStatusImpl(entity, p as keyof T);
      } else if (!isChangeableField(entity, p as any)) {
        throw new Error(`Invalid changes field ${p}`);
      } else if (kind === "m2o" || kind === "poly") {
        return new ManyToOneFieldStatusImpl(entity, p);
      } else if (kind === "enum" || kind === "primitive" || kind === "primaryKey") {
        return new PrimitiveFieldStatusImpl(entity, p);
      } else if (kind === "lo2m" || kind === "o2o") {
        throw new Error(`changes are not supported for ${kind} ${p}`);
      } else {
        return assertNever(kind);
      }
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

import { baseEntityCstr } from "./BaseEntity";
import { Entity } from "./Entity";
import { EntityConstructor, EntityManager } from "./EntityManager";
import { EntityMetadata, getMetadata } from "./EntityMetadata";
import { getProperties } from "./getProperties";

const lazySymbol = Symbol("lazy");

/**
 * Constructs an instance of `cstr` but with relations all made lazy.
 *
 * Specifically we avoid going through `new` b/c that instantiates the instance-level
 * relations like `hooks = hasMany`.
 *
 * Instead, we just call `Object.create`, which skips the constructor/super calls, and
 * any `this.books` will be handled by lazy getters that we set on the prototype.
 */
export function newEntity<T extends Entity>(em: EntityManager, cstr: EntityConstructor<T>, isNew: boolean): T {
  if (!(cstr as any)[lazySymbol]) {
    moveRelationsToGetters(cstr);
    (cstr as any)[lazySymbol] = true;
  }
  // This side-steps the `Author` constructor that initializes fields instance-level fields, which instead
  // we've shoved up to be getters on the prototype, and the only instance field we expect to have is `__data`,
  // which is set by the `baseEntityCstr` call.
  const entity = Object.create(cstr.prototype) as T;
  baseEntityCstr(em, entity as any, isNew);
  return entity;
}

function moveRelationsToGetters(cstr: EntityConstructor<any>): void {
  // Reuse getProperties's detect
  const properties = getProperties(getMetadata(cstr), true);
  for (const [fieldName, value] of Object.entries(properties)) {
    if (value instanceof RelationConstructor) {
      Object.defineProperty(cstr.prototype, fieldName, {
        get(this: any) {
          return (this.__data.relations[fieldName] ??= value.create(this, fieldName));
        },
      });
    } else if (fieldName === "transientFields") {
      Object.defineProperty(cstr.prototype, fieldName, {
        get(this: any) {
          const copy = structuredClone(value);
          Object.defineProperty(this, "transientFields", { value: copy });
          return copy;
        },
      });
    }
  }
}

/**
 * A function for `has...` methods to integrate with the `newEntity` lazy relation system.
 *
 * We need TypeScript to still see `books = hasMany(...)` as being typed as `Many<Book>`,
 * so this method's return type is `R` i.e. the `Many<Book>` relation type.
 *
 * But at runtime we actually want this to be a `RelationConstructor` that can be rewritten
 * into a getter, and only invoked when the relation is actually accessed.
 */
export function lazyRelation<T extends Entity, R>(fn: (entity: T, fieldName: string) => R): R {
  return new RelationConstructor(fn) as R;
}

/**
 * When `lazyRelation`s boot for the very first time, its when the `class`s are being evaled
 * before the `metadata.ts` file has run, so all of the `otherMetadata` imports are still
 * undefined.
 *
 * This `resolveOtherMeta` can be run after class-boot, and during `configure`, to take an
 * entity + field and return the now-available `otherMetadata`.
 */
export function resolveOtherMeta(entity: Entity, fieldName: string): EntityMetadata {
  return (getMetadata(entity).allFields[fieldName] as any).otherMetadata();
}

export class RelationConstructor<T extends Entity> {
  #fn: (entity: T, fieldName: string) => any;
  constructor(fn: (entity: T, fieldName: string) => any) {
    this.#fn = fn;
  }
  create(entity: T, fieldName: string) {
    return this.#fn(entity, fieldName);
  }
}

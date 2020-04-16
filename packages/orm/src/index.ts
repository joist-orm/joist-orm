import { Entity, IdOf, OptsOf } from "./EntityManager";
import { AbstractRelationImpl } from "./collections/AbstractRelationImpl";

export * from "./EntityManager";
export * from "./serde";
export * from "./connection";
export { fail } from "./utils";
export { OneToManyCollection } from "./collections/OneToManyCollection";
export { ManyToOneReference } from "./collections/ManyToOneReference";
export { ManyToManyCollection } from "./collections/ManyToManyCollection";
export { OrderBy, EntityFilter, ValueFilter } from "./QueryBuilder";
export { BaseEntity, Lens } from "./BaseEntity";

const F = Symbol();
const G = Symbol();
const H = Symbol();

/** A relationship from `T` to `U`, could be any of many-to-one, one-to-many, or many-to-many. */
export interface Relation<T extends Entity, U extends Entity> {
  // Make our Relation somewhat non-structural, otherwise since it's a marker interface,
  // types like `number` or `string` will match it. This also seems to nudge the type
  // inference inside of `LoadHint` to go beyond "this generic T of Entity has id and __orm"
  // to "no really this generic T has fields firstName, title, etc.".
  // See https://stackoverflow.com/questions/53448100/generic-type-of-extended-interface-not-inferred
  [F]?: T;
  [G]?: U;
}

/**
 * A many-to-one / foreign key from `T` to `U`, i.e. book to author.
 *
 * The `N` generic is for whether the field is optional (i.e. the foreign key column is
 * nullable). If it is optional, `N` will be `undefined`, which makes the return types
 * `U | undefined`. If it is not optional, `N` will be `never`, making the return types
 * `U | never` which becomes just `U`.
 */
export interface Reference<T extends Entity, U extends Entity, N extends never | undefined> extends Relation<T, U> {
  /** Returns the id of the current assigned entity, or `undefined` if the assigned entity has no id yet, or `undefined` if this column is nullable and currently unset. */
  id: IdOf<U> | undefined;

  /** Returns the id of the current assigned entity or a runtime error if it's either a) unset or b) set to a new entity that doesn't have an `id` yet. */
  idOrFail: IdOf<U>;

  load(): Promise<U | N>;

  set(other: U | N): void;

  /** Returns `true` if this relation is currently set (i.e. regardless of whether it's loaded, or if it is set but the assigned entity doesn't have an id saved. */
  isSet(): boolean;

  [H]?: N;
}

/** Adds a known-safe `get` accessor. */
export interface LoadedReference<T extends Entity, U extends Entity, N extends never | undefined>
  extends Omit<Reference<T, U, N>, "id"> {
  // Since we've fetched the entity from the db, we're going to omit out the "| undefined" from Reference.id
  // which handles "this reference is set to a new entity" and just assume the id is there (or else N which
  // is for nullable references, which will just always be potentially `undefined`).
  //
  // Note that, similar to `.get`, this is _usually_ right, but if the user mutates the object graph after the
  // populate, i.e. they change some fields to have actually-new / not-included-in-the-`populate` call entities,
  // then these might turn into runtime errors. But the ergonomics are sufficiently better that it is worth it.
  id: IdOf<T> | N;

  get: U | N;
}

/** A collection of `U` within `T`, either one-to-many or many-to-many. */
export interface Collection<T extends Entity, U extends Entity> extends Relation<T, U> {
  load(): Promise<ReadonlyArray<U>>;

  add(other: U): void;

  remove(other: U): void;
}

/** Adds a known-safe `get` accessor. */
export interface LoadedCollection<T extends Entity, U extends Entity> extends Collection<T, U> {
  get: ReadonlyArray<U>;

  set(values: U[]): void;

  removeAll(): void;
}

// https://spin.atomicobject.com/2018/01/15/typescript-flexible-nominal-typing/
interface Flavoring<FlavorT> {
  _type?: FlavorT;
}
export type Flavor<T, FlavorT> = T & Flavoring<FlavorT>;

export function setField(entity: Entity, fieldName: string, newValue: any): void {
  ensureNotDeleted(entity);
  const { data, originalData } = entity.__orm;
  // "Un-dirty" our originalData if newValue is reverting to originalData
  if (fieldName in originalData) {
    if (originalData[fieldName] === newValue) {
      data[fieldName] = newValue;
      delete originalData[fieldName];
      return;
    }
  }
  // Push this logic into a field serde type abstraction?
  const currentValue = data[fieldName];
  if (currentValue === newValue) {
    return;
  }
  // Only save the currentValue on the 1st change of this field
  if (!(fieldName in originalData)) {
    originalData[fieldName] = currentValue;
  }
  data[fieldName] = newValue;
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
  values: OptsOf<T>,
  opts: { calledFromConstructor?: boolean; ignoreUndefined?: boolean },
): void {
  // If `values` is undefined, this instance is being hydrated from a database row, so skip all this.
  if (values === undefined) {
    return;
  }
  const { calledFromConstructor, ignoreUndefined } = opts;
  Object.entries(values as {}).forEach(([key, _value]) => {
    // We let optional opts fields be `| null` for convenience, and convert to undefined.
    if (ignoreUndefined && _value === undefined) {
      return;
    }
    const value = _value === null ? undefined : _value;
    const current = (entity as any)[key];
    if (current instanceof AbstractRelationImpl) {
      if (calledFromConstructor) {
        current.setFromOpts(value);
      } else {
        current.set(value);
      }
    } else {
      (entity as any)[key] = value;
    }
  });
  if (calledFromConstructor) {
    Object.values(entity).forEach((v) => {
      if (v instanceof AbstractRelationImpl) {
        v.initializeForNewEntity();
      }
    });
  }
}

export function ensureNotDeleted(entity: Entity): void {
  if (entity.__orm.deleted) {
    throw new Error(entity.toString() + " is marked as deleted");
  }
}

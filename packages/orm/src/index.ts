import { Entity } from "./EntityManager";
import { AbstractRelationImpl } from "./collections/AbstractRelationImpl";

export * from "./EntityManager";
export * from "./serde";
export * from "./connection";
export { fail } from "./utils";
export { OneToManyCollection } from "./collections/OneToManyCollection";
export { ManyToOneReference } from "./collections/ManyToOneReference";
export { ManyToManyCollection } from "./collections/ManyToManyCollection";
export { EntityFilter, ValueFilter } from "./QueryBuilder";

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
  id: string | N;

  load(): Promise<U | N>;

  set(other: U | N): void;

  [H]?: N;
}

/** Adds a known-safe `get` accessor. */
export interface LoadedReference<T extends Entity, U extends Entity, N extends never | undefined>
  extends Reference<T, U, N> {
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
}

// https://spin.atomicobject.com/2018/01/15/typescript-flexible-nominal-typing/
interface Flavoring<FlavorT> {
  _type?: FlavorT;
}
export type Flavor<T, FlavorT> = T & Flavoring<FlavorT>;

export function setOpts(entity: Entity, opts: object): void {
  // If opts is undefined, this instance is being hydrated from a database row, so skip all this.
  if (opts === undefined) {
    return;
  }
  Object.entries(opts).forEach(([key, _value]) => {
    // We let optional opts fields be `| null` for convenience, and convert to undefined.
    const value = _value === null ? undefined : _value;
    const current = (entity as any)[key];
    if (current instanceof AbstractRelationImpl) {
      current.setFromOpts(value);
    } else {
      (entity as any)[key] = value;
    }
  });
  Object.values(entity).forEach(v => {
    if (v instanceof AbstractRelationImpl) {
      v.initializeForNewEntity();
    }
  });
}

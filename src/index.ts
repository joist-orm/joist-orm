import { Entity } from "./EntityManager";

const F = Symbol();
const G = Symbol();

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

/** A many-to-one / foreign key from `T` to `U`. */
export interface Reference<T extends Entity, U extends Entity> extends Relation<T, U> {
  load(): Promise<U>;

  set(other: U): void;
}

/** Adds a known-safe `get()` method. */
export interface LoadedReference<T extends Entity, U extends Entity> extends Reference<T, U> {
  get(): U;
}

/** A collection of `U` within `T`, either one-to-many or many-to-many. */
export interface Collection<T extends Entity, U extends Entity> extends Relation<T, U> {
  load(): Promise<ReadonlyArray<U>>;

  add(other: U): void;
}

/** Adds a known-safe `get()` method. */
export interface LoadedCollection<T extends Entity, U extends Entity> extends Collection<T, U> {
  get(): ReadonlyArray<U>;
}

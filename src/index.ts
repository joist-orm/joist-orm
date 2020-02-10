import { Entity } from "./EntityManager";

/** A relationship from `T` to `U`, could be any of many-to-one, one-to-many, or many-to-many. */
export interface Relation<T extends Entity, U extends Entity> {}

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


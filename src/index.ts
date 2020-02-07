import { Entity } from "./EntityManager";

export interface Reference<T extends Entity, U extends Entity> {
  load(): Promise<U>;

  set(other: U): void;
}

/** Removes the `Reference.get()` method so that callers must use `.load()`. */
export interface LoadedReference<T extends Entity, U extends Entity> extends Reference<T, U> {
  get(): U;
}

export interface Collection<T extends Entity, U extends Entity> {
  load(): Promise<ReadonlyArray<U>>;

  add(other: U): void;
}

/** Removes the `Collection.get()` method so that callers must use `.load()`. */
export interface LoadedCollection<T extends Entity, U extends Entity> extends Collection<T, U> {
  get(): ReadonlyArray<U>;
}

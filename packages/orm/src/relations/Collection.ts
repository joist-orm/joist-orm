import { Entity, IdOf } from "../EntityManager";
import { Relation } from "./Relation";

/** A collection of `U` within `T`, either one-to-many or many-to-many. */
export interface Collection<T extends Entity, U extends Entity> extends Relation<T, U> {
  load(opts?: { withDeleted: boolean }): Promise<ReadonlyArray<U>>;

  find(id: IdOf<U>): Promise<U | undefined>;

  add(other: U): void;

  remove(other: U): void;

  readonly isLoaded: boolean;
}

/** Adds a known-safe `get` accessor. */
export interface LoadedCollection<T extends Entity, U extends Entity> extends Collection<T, U> {
  get: ReadonlyArray<U>;

  getWithDeleted: ReadonlyArray<U>;

  set(values: U[]): void;

  removeAll(): void;
}

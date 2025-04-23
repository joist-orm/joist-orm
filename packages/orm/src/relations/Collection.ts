import { Entity } from "../Entity";
import { IdOf } from "../EntityManager";
import { CustomCollection, ManyToManyCollection, OneToManyCollection, Relation } from "./index";

/** A collection of `U` within `T`, either one-to-many or many-to-many. */
export interface Collection<T extends Entity, U extends Entity> extends Relation<T, U> {
  load(opts?: { withDeleted: boolean }): Promise<ReadonlyArray<U>>;

  /** Looks up the specific `id` without fully loading the collection. */
  find(id: IdOf<U>): Promise<U | undefined>;

  /** Looks up the specific `other` without fully loading the collection. */
  includes(other: U): Promise<boolean>;

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

/** Type guard utility for determining if an entity field is a Collection. */
export function isCollection(maybeCollection: any): maybeCollection is Collection<any, any> {
  return (
    maybeCollection instanceof OneToManyCollection ||
    maybeCollection instanceof ManyToManyCollection ||
    maybeCollection instanceof CustomCollection
  );
}

/** Type guard utility for determining if an entity field is a loaded Collection. */
export function isLoadedCollection(
  maybeCollection: any,
): maybeCollection is Collection<any, any> & LoadedCollection<any, any> {
  return isCollection(maybeCollection) && maybeCollection.isLoaded;
}

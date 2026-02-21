import { Entity } from "../Entity";
import {
  RecursiveChildrenCollectionImpl,
  RecursiveM2mCollectionImpl,
  RecursiveParentsCollectionImpl,
} from "./RecursiveCollection";
import { Relation } from "./Relation";

/** A collection of `U` within `T`, either one-to-many or many-to-many. */
export interface ReadOnlyCollection<T extends Entity, U extends Entity> extends Relation<T, U> {
  load(opts?: { withDeleted: boolean }): Promise<ReadonlyArray<U>>;

  readonly isLoaded: boolean;
}

/** Adds a known-safe `get` accessor. */
export interface LoadedReadOnlyCollection<T extends Entity, U extends Entity> extends ReadOnlyCollection<T, U> {
  get: ReadonlyArray<U>;

  getWithDeleted: ReadonlyArray<U>;
}

/** Type guard utility for determining if an entity field is a `ReadOnlyCollection`. */
export function isReadOnlyCollection(maybeCollection: any): maybeCollection is ReadOnlyCollection<any, any> {
  return (
    maybeCollection instanceof RecursiveParentsCollectionImpl ||
    maybeCollection instanceof RecursiveChildrenCollectionImpl ||
    maybeCollection instanceof RecursiveM2mCollectionImpl
  );
}

/** Type guard utility for determining if an entity field is a loaded `ReadOnlyCollection`. */
export function isLoadedReadOnlyCollection(
  maybeCollection: any,
): maybeCollection is ReadOnlyCollection<any, any> & LoadedReadOnlyCollection<any, any> {
  return isReadOnlyCollection(maybeCollection) && maybeCollection.isLoaded;
}

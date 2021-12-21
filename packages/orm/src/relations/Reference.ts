import { Entity, IdOf } from "../EntityManager";
import { CustomReference } from "./CustomReference";
import { ManyToOneReference } from "./ManyToOneReference";
import { OneToOneReference } from "./OneToOneReference";
import { PolymorphicReference } from "./PolymorphicReference";
import { Relation } from "./Relation";

const H = Symbol();

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

  idUntagged: string | undefined;

  idUntaggedOrFail: string;

  readonly isLoaded: boolean;

  load(opts?: { withDeleted: boolean }): Promise<U | N>;

  set(other: U | N): void;

  /** Returns `true` if this relation is currently set (i.e. regardless of whether it's loaded, or if it is set but the assigned entity doesn't have an id saved. */
  readonly isSet: boolean;

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

  getWithDeleted: U | N;
}

/** Type guard utility for determining if an entity field is a Reference. */
export function isReference(maybeReference: any): maybeReference is Reference<any, any, any> {
  return (
    maybeReference instanceof OneToOneReference ||
    maybeReference instanceof ManyToOneReference ||
    maybeReference instanceof CustomReference ||
    maybeReference instanceof PolymorphicReference
  );
}

/** Type guard utility for determining if an entity field is a loaded Reference. */
export function isLoadedReference(
  maybeReference: any,
): maybeReference is Reference<any, any, any> & LoadedReference<any, any, any> {
  return isReference(maybeReference) && maybeReference.isLoaded;
}

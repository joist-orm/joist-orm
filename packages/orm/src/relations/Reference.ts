import { Entity } from "../Entity";
import { IdOf, TaggedId } from "../EntityManager";
import { CustomReference } from "./CustomReference";
import { ManyToOneReferenceImpl } from "./ManyToOneReference";
import { OneToOneReferenceImpl } from "./OneToOneReference";
import { PolymorphicReferenceImpl } from "./PolymorphicReference";
import { ReactiveReferenceImpl } from "./ReactiveReference";
import { Relation } from "./Relation";

// Exported and used in sub-interfaces/types per https://stackoverflow.com/a/70437874/355031
export const ReferenceN = Symbol();

/**
 * A many-to-one / foreign key from `T` to `U`, i.e. book to author.
 *
 * The `N` generic is for whether the field is optional (i.e. the foreign key column is
 * nullable). If it is optional, `N` will be `undefined`, which makes the return types
 * `U | undefined`. If it is not optional, `N` will be `never`, making the return types
 * `U | never` which becomes just `U`.
 */
export interface Reference<T extends Entity, U extends Entity, N extends never | undefined> extends Relation<T, U> {
  [ReferenceN]: N;

  readonly isLoaded: boolean;

  load(opts?: { withDeleted?: boolean; forceReload?: true }): Promise<U | N>;

  set(other: U | N): void;

  idTaggedMaybe: TaggedId | undefined;
}

/** Adds a known-safe `get` accessor. */
export interface LoadedReference<T extends Entity, U extends Entity, N extends never | undefined>
  extends Reference<T, U, N> {
  // Since we've fetched the entity from the db, we're going to omit out the "| undefined" from Reference.id
  // which handles "this reference is set to a new entity" and just assume the id is there (or else N which
  // is for nullable references, which will just always be potentially `undefined`).
  //
  // Note that, similar to `.get`, this is _usually_ right, but if the user mutates the object graph after the
  // populate, i.e. they change some fields to have actually-new / not-included-in-the-`populate` call entities,
  // then these might turn into runtime errors. But the ergonomics are sufficiently better that it is worth it.
  id: IdOf<U> | N;

  get: U | N;

  getWithDeleted: U | N;

  // We keep isSet in LoadedReference, instead of Reference, b/c o2o extends and it cannot
  // implement isSet until it's loaded.
  isSet: boolean;
}

/** Type guard utility for determining if an entity field is a Reference. */
export function isReference(maybeReference: any): maybeReference is Reference<any, any, any> {
  return (
    maybeReference instanceof OneToOneReferenceImpl ||
    maybeReference instanceof ManyToOneReferenceImpl ||
    maybeReference instanceof ReactiveReferenceImpl ||
    maybeReference instanceof CustomReference ||
    maybeReference instanceof PolymorphicReferenceImpl
  );
}

/** Type guard utility for determining if an entity field is a loaded Reference. */
export function isLoadedReference(
  maybeReference: any,
): maybeReference is Reference<any, any, any> & LoadedReference<any, any, any> {
  return isReference(maybeReference) && maybeReference.isLoaded;
}

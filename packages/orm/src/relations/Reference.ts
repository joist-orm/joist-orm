import { Entity, IdOf } from "../EntityManager";
import { CustomReference } from "./CustomReference";
import { ManyToOneReferenceImpl } from "./ManyToOneReference";
import { OneToOneReferenceImpl } from "./OneToOneReference";
import { PolymorphicReference } from "./PolymorphicReference";
import { Relation, RelationT, RelationU } from "./Relation";

// Exported and used in sub-interfaces/types per https://stackoverflow.com/a/70437874/355031
export const ReferenceN = Symbol();

// We could go back to `N extends never | undefined` once https://github.com/microsoft/TypeScript/issues/47213
// is resolved so that `MarkLoaded` can keep matching on `Reference` and it works with sub-interfaces.
export type MaybeUndefined<T, N extends NullOrNotNull> = N extends "null" ? T | undefined : T;
export type NullOrNotNull = "null" | "not-null";

/**
 * A many-to-one / foreign key from `T` to `U`, i.e. book to author.
 *
 * The `N` generic is for whether the field is optional (i.e. the foreign key column is
 * nullable). If it is optional, `N` will be `undefined`, which makes the return types
 * `U | undefined`. If it is not optional, `N` will be `U`, making the return types
 * `U | U` which becomes just `U`.
 */
export interface Reference<T extends Entity, U extends Entity, N extends NullOrNotNull> extends Relation<T, U> {
  readonly isLoaded: boolean;

  load(opts?: { withDeleted: boolean }): Promise<MaybeUndefined<U, N>>;

  set(other: MaybeUndefined<U, N>): void;

  [RelationT]?: T;
  [RelationU]?: U;
  [ReferenceN]?: N;
}

/** Adds a known-safe `get` accessor. */
export interface LoadedReference<T extends Entity, U extends Entity, N extends NullOrNotNull>
  extends Reference<T, U, N> {
  // Since we've fetched the entity from the db, we're going to omit out the "| undefined" from Reference.id
  // which handles "this reference is set to a new entity" and just assume the id is there (or else N which
  // is for nullable references, which will just always be potentially `undefined`).
  //
  // Note that, similar to `.get`, this is _usually_ right, but if the user mutates the object graph after the
  // populate, i.e. they change some fields to have actually-new / not-included-in-the-`populate` call entities,
  // then these might turn into runtime errors. But the ergonomics are sufficiently better that it is worth it.
  id: MaybeUndefined<IdOf<T>, N>;

  get: MaybeUndefined<U, N>;

  getWithDeleted: MaybeUndefined<U, N>;
}

/** Type guard utility for determining if an entity field is a Reference. */
export function isReference(maybeReference: any): maybeReference is Reference<any, any, any> {
  return (
    maybeReference instanceof OneToOneReferenceImpl ||
    maybeReference instanceof ManyToOneReferenceImpl ||
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

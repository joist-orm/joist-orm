import {
  Collection,
  currentlyInstantiatingEntity,
  Entity,
  EntityMetadata,
  ManyToManyCollection,
  ManyToOneReference,
  OneToManyCollection,
  OneToOneReference,
} from "../";
import { PolymorphicReference } from "./PolymorphicReference";
import { Reference } from "./Reference";

export { Collection, isCollection, isLoadedCollection, LoadedCollection } from "./Collection";
export { CustomCollection } from "./CustomCollection";
export { CustomReference } from "./CustomReference";
export {
  AsyncProperty,
  hasAsyncProperty,
  isAsyncProperty,
  isLoadedAsyncProperty,
  LoadedProperty,
} from "./hasAsyncProperty";
export { hasManyDerived } from "./hasManyDerived";
export { hasManyThrough } from "./hasManyThrough";
export { hasOneDerived } from "./hasOneDerived";
export { hasOneThrough } from "./hasOneThrough";
export { ManyToManyCollection } from "./ManyToManyCollection";
export { ManyToOneReference } from "./ManyToOneReference";
export { OneToManyCollection } from "./OneToManyCollection";
export { OneToOneReference } from "./OneToOneReference";
export { isLoadedReference, isReference, LoadedReference, Reference } from "./Reference";
export { isRelation, Relation } from "./Relation";

/** An alias for creating `OneToManyCollection`s. */
export function hasMany<T extends Entity, U extends Entity>(
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T,
  otherFieldName: keyof U,
  otherColumnName: string,
): Collection<T, U> {
  const entity = currentlyInstantiatingEntity as T;
  return new OneToManyCollection(entity, otherMeta, fieldName, otherFieldName, otherColumnName);
}

/** An alias for creating `ManyToOneReference`s. */
export function hasOne<T extends Entity, U extends Entity, N extends never | undefined>(
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T,
  otherFieldName: keyof U,
): Reference<T, U, N> {
  const entity = currentlyInstantiatingEntity as T;
  return new ManyToOneReference<T, U, N>(entity, otherMeta, fieldName, otherFieldName);
}

export function hasOnePolymorphic<T extends Entity, U extends Entity, N extends never | undefined>(
  fieldName: keyof T,
): Reference<T, U, N> {
  const entity = currentlyInstantiatingEntity as T;
  return new PolymorphicReference<T, U, N>(entity, fieldName);
}

/** An alias for creating `OneToOneReference`s. */
export function hasOneToOne<T extends Entity, U extends Entity>(
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T,
  otherFieldName: keyof U,
  otherColumnName: string,
): Reference<T, U, undefined> {
  const entity = currentlyInstantiatingEntity as T;
  return new OneToOneReference<T, U>(entity, otherMeta, fieldName, otherFieldName, otherColumnName);
}

/** An alias for creating `ManyToManyCollections`s. */
export function hasManyToMany<T extends Entity, U extends Entity>(
  joinTableName: string,
  fieldName: keyof T,
  columnName: string,
  otherMeta: EntityMetadata<U>,
  otherFieldName: keyof U,
  otherColumnName: string,
): Collection<T, U> {
  const entity = currentlyInstantiatingEntity as T;
  return new ManyToManyCollection<T, U>(
    joinTableName,
    entity,
    fieldName,
    columnName,
    otherMeta,
    otherFieldName,
    otherColumnName,
  );
}

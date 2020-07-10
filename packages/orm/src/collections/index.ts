import {
  Collection,
  currentlyInstantiatingEntity,
  Entity,
  EntityMetadata,
  ManyToManyCollection,
  ManyToOneReference,
  OneToManyCollection,
  OneToOneReference,
  Reference,
} from "../";

export { OneToManyCollection } from "./OneToManyCollection";
export { OneToOneReference } from "./OneToOneReference";
export { ManyToOneReference } from "./ManyToOneReference";
export { ManyToManyCollection } from "./ManyToManyCollection";
export { CustomReference } from "./CustomReference";
export { hasOneThrough } from "./hasOneThrough";
export { hasOneDerived } from "./hasOneDerived";
export { CustomCollection } from "./CustomCollection";
export { hasManyThrough } from "./hasManyThrough";
export { hasManyDerived } from "./hasManyDerived";

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

/** An alias for creating `OneToOneReference`s. */
export function hasOneToOne<T extends Entity, U extends Entity>(
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T,
  otherFieldName: keyof U,
): Reference<T, U, undefined> {
  const entity = currentlyInstantiatingEntity as T;
  return new OneToOneReference<T, U>(entity, otherMeta, fieldName, otherFieldName);
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

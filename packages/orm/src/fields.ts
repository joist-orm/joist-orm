import { getOrmField } from "./BaseEntity";
import { Entity, isEntity } from "./Entity";
import { getEmInternalApi } from "./EntityManager";
import { getMetadata } from "./EntityMetadata";
import { ensureNotDeleted, maybeResolveReferenceToId } from "./index";

/**
 * Returns the current value of `fieldName`, this is an internal method that should
 * only be called by the code-generated getters.
 *
 * We skip any typing like `fieldName: keyof T` because this method should only be
 * called by trusted codegen anyway.
 */
export function getField(
  entity: Entity,
  fieldName: string,
  internalCall: boolean = false,
  /** If true, return the AbstractRelationImpl wrapper instead of the raw db value. */
  maybeRelation: boolean = false,
): any {
  // We may not have converted the database column value into domain values yet
  const { data, row } = getOrmField(entity);
  const { findPlugin } = getEmInternalApi(entity.em);
  if (!(fieldName in data)) {
    // We may not have a serde if this is a collection like `Author.books`, and the caller just wants our ManyToOneReference
    const serde = getMetadata(entity).allFields[fieldName].serde;
    if (serde) {
      serde.setOnEntity(data, row);
    }
  }
  !internalCall && findPlugin?.beforeGetField?.(entity, fieldName);
  if (maybeRelation) return (entity as any)[fieldName];
  return data[fieldName];
}

/** Returns whether `fieldName` is a field/column on `entity` that can be changed. */
export function isChangeableField(entity: Entity, fieldName: string): boolean {
  return !!getMetadata(entity).allFields[fieldName]?.serde;
}

/** Returns whether `fieldName` has been set, even if it's undefined, on `entity`. */
export function isFieldSet(entity: Entity, fieldName: string): boolean {
  const { data } = getOrmField(entity);
  if (fieldName in data) return true;
  // Avoid calling `getField` on new entities because it populates the field as a side effect.
  if (entity.isNewEntity) return false;
  // We may not have converted the database column value into domain values yet.
  getField(entity, fieldName);
  return fieldName in data;
}

/**
 * Returns whether `newValue` is different from the current value of `fieldName`.
 */
export function isChangedValue(entity: Entity, fieldName: string, newValue: any): boolean {
  const currentValue = getField(entity, fieldName);
  return !equalOrSameEntity(currentValue, newValue);
}

/**
 * Sets the current value of `fieldName`, this is an internal method that should
 * only be called by the code-generated setters.
 *
 * We skip any typing like `fieldName: keyof T` because this method should only be
 * called by trusted codegen anyway.
 *
 * Returns `true` if the value was changed, or `false` if it was a noop.
 */
export function setField(entity: Entity, fieldName: string, newValue: any): boolean {
  ensureNotDeleted(entity, "pending");
  const { em } = entity;

  getEmInternalApi(em).checkWritesAllowed();

  const { findPlugin } = getEmInternalApi(em);
  findPlugin?.beforeSetField?.(entity, fieldName, newValue);

  const { data, originalData } = getOrmField(entity);

  // "Un-dirty" our originalData if newValue is reverting to originalData
  if (fieldName in originalData) {
    if (equalOrSameEntity(originalData[fieldName], newValue)) {
      data[fieldName] = newValue;
      delete originalData[fieldName];
      getEmInternalApi(em).rm.dequeueDownstreamReactiveFields(entity, fieldName);
      return true;
    }
  }

  // Push this logic into a field serde type abstraction?
  const currentValue = getField(entity, fieldName);
  if (equalOrSameEntity(currentValue, newValue)) {
    return false;
  }

  // Only save the currentValue on the 1st change of this field
  if (!(fieldName in originalData)) {
    originalData[fieldName] = currentValue;
  }
  getEmInternalApi(em).rm.queueDownstreamReactiveFields(entity, fieldName);
  data[fieldName] = newValue;
  return true;
}

function equalOrSameEntity(a: any, b: any): boolean {
  return (
    equal(a, b) ||
    (Array.isArray(a) && Array.isArray(b) && equalArrays(a, b)) ||
    // This is kind of gross, but make sure not to compare two both-new entities
    (((isEntity(a) && !a.isNewEntity) || (isEntity(b) && !b.isNewEntity)) &&
      maybeResolveReferenceToId(a) === maybeResolveReferenceToId(b))
  );
}

function equalArrays(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((_: any, i) => equal(a[i], b[i]));
}

function equal(a: any, b: any): boolean {
  return a === b || (a instanceof Date && b instanceof Date && a.getTime() == b.getTime());
}

import { Temporal } from "temporal-polyfill";
import { getInstanceData } from "./BaseEntity";
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
export function getField(entity: Entity, fieldName: string): any {
  // We may not have converted the database column value into domain values yet
  const { data, row } = getInstanceData(entity);
  if (fieldName in data) {
    return data[fieldName];
  } else {
    const serde = getMetadata(entity).allFields[fieldName].serde ?? fail(`Missing serde for ${fieldName}`);
    serde.setOnEntity(data, row);
    return data[fieldName];
  }
}

/** Returns whether `fieldName` is a field/column on `entity` that can be changed. */
export function isChangeableField(entity: Entity, fieldName: string): boolean {
  return !!getMetadata(entity).allFields[fieldName]?.serde;
}

/** Returns whether `fieldName` has been set, even if it's undefined, on `entity`. */
export function isFieldSet(entity: Entity, fieldName: string): boolean {
  const { data } = getInstanceData(entity);
  if (fieldName in data) return true;
  // Avoid calling `getField` on new entities because it populates the field as a side effect.
  if (entity.isNewEntity) return false;
  // We may not have converted the database column value into domain values yet.
  getField(entity, fieldName);
  return fieldName in data;
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

  const { data, originalData, flushedData } = getInstanceData(entity);

  // If a `set` occurs during the rqf-loop, copy the last-flushed value to flushedData.
  // Then our `pendingOperation` logic can tell "do we need another micro-flush?" separately
  // from our public-facing changed fields logic.
  if (flushedData) {
    // Get the currentValue, which is what we should have flushed to the db
    const currentValue = getField(entity, fieldName);
    if (fieldName in flushedData) {
      // We've already copied the last-micro-flush value into flushedData,
      // are we changing back to that? If so, we won't need another micro-flush.
      if (equalOrSameEntity(flushedData[fieldName], newValue)) {
        delete flushedData[fieldName];
      } else {
        // Otherwise just let data[fieldName] get the even-newer value, and keep
        // flushedData[fieldName] as the last-micro-flushed value.
      }
    } else if (!equalOrSameEntity(currentValue, newValue)) {
      // This is the 1st rqf-loop change for this field, so let data[fieldName]
      // get the even newer value, but keep the last-micro-flushed value in flushedData.
      flushedData[fieldName] = currentValue;
    }
  }

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
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Temporal.ZonedDateTime && b instanceof Temporal.ZonedDateTime) return a.equals(b);
  if (a instanceof Temporal.PlainDateTime && b instanceof Temporal.PlainDateTime) return a.equals(b);
  if (a instanceof Temporal.PlainDate && b instanceof Temporal.PlainDate) return a.equals(b);
  return false;
}

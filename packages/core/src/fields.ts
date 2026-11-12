import { getInstanceData } from "src/BaseEntity.ts";
import { type Entity, isEntity } from "src/Entity.ts";
import { getEmInternalApi } from "src/EntityManager.ts";
import { type Field, getBaseMeta, getMetadata } from "src/EntityMetadata.ts";
import { cleanStringValue, ensureNotDeleted, maybeResolveReferenceToId } from "src/index.ts";
import type { InstanceData } from "src/InstanceData.ts";
import { maybeRequireTemporal } from "src/serde/temporal.ts";
import { isInTrustedContext } from "src/trusted.ts";
import { fail } from "src/utils.ts";

type ReadWordName = "__readFields" | `__readFields${number}`;
type EntityReadWords = Entity & Record<ReadWordName, number>;

/**
 * Returns the current value of `fieldName`, marking the entity for read locking if the field is configured.
 *
 * Ordinary EMs skip hooks once a field is warm. Visibility-aware EMs
 * check every untrusted read and cache only trusted reads, which skip read hooks.
 *
 * Install plugins before reading entities; adding one later does not replay cached reads.
 * Generated getters and direct application calls are protected by default. Only ORM
 * housekeeping should pass `isInternal`, not domain logic in hooks, rules, or reactions.
 * The field name is a string because generated getters and ORM internals know its type.
 */
export function getField(entity: Entity, fieldName: string, isInternal = false): any {
  const instanceData = getInstanceData(entity);
  const index = instanceData.metadata.fieldReadIndexes[fieldName];
  if (typeof index !== "number") fail(`Unknown field ${instanceData.metadata.type}.${fieldName}`);
  // Direct getField calls use the same warm-read fast path as generated getters.
  if ((getFieldReadWord(entity, index >>> 5) & (1 << (index & 31))) !== 0) {
    return instanceData.data[fieldName];
  }
  return readField(entity, instanceData, fieldName, isInternal, index);
}

/** Reads stored state for ORM bookkeeping without authorizing or warming a public read. */
export function getStoredField<T = unknown>(entity: Entity, fieldName: string): T {
  const instanceData = getInstanceData(entity);
  const { data, metadata, rowData, rowIndex } = instanceData;
  if (!(fieldName in data) && !instanceData.isNewEntity) {
    const serde = metadata.allFields[fieldName]?.serde ?? fail(`Missing serde for ${fieldName}`);
    data[fieldName] = serde.fromRow(rowData, rowIndex);
  }
  return data[fieldName] as T;
}

/** Checks stored deletion state without authorizing or warming a public timestamp read. */
export function isSoftDeleted(entity: Entity): boolean {
  const fieldName = getBaseMeta(getMetadata(entity)).timestampFields?.deletedAt;
  return fieldName !== undefined && getStoredField(entity, fieldName) !== undefined;
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
  getField(entity, fieldName, true);
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
  const api = getEmInternalApi(em);
  const { rm, pluginManager, indexManager, fieldLogger, isLoadedCache } = api;

  // If we're flushing, only allow writes from hooks
  api.checkWritesAllowed();

  const instanceData = getInstanceData(entity);
  const { data, originalData, flushedData } = instanceData;

  // Do string sanitization
  const field = getMetadata(entity).allFields[fieldName];
  if (field.kind === "primitive" && field.type === "string" && field.sanitize !== false) {
    newValue = cleanStringValue(newValue);
  }

  const currentValue = getField(entity, fieldName, true);
  const isReference = field.kind === "m2o" || field.kind === "poly";
  const currentEqualsNew = fieldValueEquals(field, currentValue, newValue);

  // Tell any `#isLoaded` or `#value` caches that they might be stale, but only
  // after we've checked if the current value changed. Also we do it here,
  // before the "reverting a dirty value to the original" check below,
  // because caches might have already observed the dirty value, so would
  // still need to refresh.
  if (!currentEqualsNew) isLoadedCache.resetIsLoaded(entity, fieldName);

  // Check `config.setTransitions` tables while the change is still synchronous, before we change anything,
  // and record the transition for `em.flush` to run its (async) guards and reactions
  if (field.kind === "enum" && !currentEqualsNew) rm.queueTransition(entity, fieldName, currentValue, newValue);
  // Remember every prior reference value so `followReverseHint` can rewalk both original and transient owners.
  if (isReference && !currentEqualsNew) {
    instanceData.rememberReferenceValue(fieldName, currentValue);
  }

  // If a `set` occurs during the AsyncReactiveField-loop, copy the last-flushed value to flushedData.
  // Then our `pendingOperation` logic can tell "do we need another micro-flush?" separately
  // from our public-facing changed fields logic.
  if (flushedData) {
    if (fieldName in flushedData) {
      // We've already copied the last-micro-flush value into flushedData,
      // are we changing back to that? If so, we won't need another micro-flush.
      if (equalOrSameEntity(flushedData[fieldName], newValue)) {
        delete flushedData[fieldName];
      } else {
        // Otherwise just let data[fieldName] get the even-newer value, and keep
        // flushedData[fieldName] as the last-micro-flushed value.
      }
    } else if (!currentEqualsNew) {
      // This is the 1st rqf-loop change for this field, so let data[fieldName]
      // get the even newer value, but keep the last-micro-flushed value in flushedData.
      flushedData[fieldName] = currentValue;
    }
  }

  // "Un-dirty" our originalData if newValue is reverting to originalData
  if (fieldName in originalData) {
    if (fieldValueEquals(field, originalData[fieldName], newValue)) {
      indexManager.maybeUpdateFieldIndex(entity, fieldName, currentValue, newValue);

      pluginManager.beforeSetField(entity, fieldName, newValue);
      data[fieldName] = newValue;
      instanceData.markFieldClean(fieldName);

      fieldLogger.logSet(entity, fieldName, newValue);
      if (isReference && instanceData.getReferenceHistory(fieldName).length > 0) {
        rm.queueDownstreamReactables(entity, fieldName);
      } else {
        // For normal reverts, the field is clean again, so any pending downstream work can be removed.
        rm.dequeueDownstreamReactables(entity, fieldName);
      }

      return true;
    }
  }

  // Push this logic into a field serde type abstraction?
  if (currentEqualsNew) {
    // If we're doing `entity.field = undefined`, we'll be equal, but mark ourselves as "set"
    // so that defaults know to respect the intent of keeping this field undefined.
    if (!(fieldName in data)) data[fieldName] = undefined;
    return false;
  }

  // Only save the currentValue on the 1st change of this field
  if (!(fieldName in originalData)) {
    instanceData.markFieldDirty(fieldName, currentValue);
  }
  fieldLogger.logSet(entity, fieldName, newValue);
  rm.queueDownstreamReactables(entity, fieldName);

  indexManager.maybeUpdateFieldIndex(entity, fieldName, currentValue, newValue);

  pluginManager.beforeSetField(entity, fieldName, newValue);
  data[fieldName] = newValue;
  return true;
}

function fieldValueEquals(field: Field, a: unknown, b: unknown): boolean {
  // Primitive scalar sets are the common path, so avoid Date/Temporal/entity checks when both values cannot need them.
  if (field.kind !== "m2o" && field.kind !== "poly" && isNonObjectValue(a) && isNonObjectValue(b)) return a === b;
  return equalOrSameEntity(a, b);
}

function isNonObjectValue(value: unknown): boolean {
  return value === null || typeof value !== "object";
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

export function equalArrays(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((_: any, i) => equal(a[i], b[i]));
}

const Temporal = maybeRequireTemporal()?.Temporal;
export function equal(a: any, b: any): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Temporal) {
    if (a instanceof Temporal.ZonedDateTime && b instanceof Temporal.ZonedDateTime) return a.equals(b);
    if (a instanceof Temporal.PlainDateTime && b instanceof Temporal.PlainDateTime) return a.equals(b);
    if (a instanceof Temporal.PlainDate && b instanceof Temporal.PlainDate) return a.equals(b);
  }
  return false;
}

/**
 * Performs read callbacks, protection, and lazy conversion before publishing the warm-read bit.
 *
 * Reentrant reads may inspect the value, but only the outer read can publish a warm bit
 * after its hooks succeed.
 */
function readField(
  entity: Entity,
  instanceData: InstanceData,
  fieldName: string,
  isInternal: boolean,
  index: number,
): any {
  const { em, metadata } = instanceData;
  // Ordinary EMs pay this check only until the field is warm; subsequent reads skip this path.
  const shouldMarkReadField = runFieldReadHooks(entity, instanceData, fieldName);

  const field = metadata.allFields[fieldName];
  if (!isInternal && field?.assertUnchanged) em.assertUnchanged(entity);
  // Hooks may replace a cached value, so inspect current storage only after they finish.
  const { data } = instanceData;
  if (!(fieldName in data) && !instanceData.isNewEntity) {
    // We may not have converted the database column value into domain values yet.
    const serde = field?.serde ?? fail(`Missing serde for ${fieldName}`);
    data[fieldName] = serde.fromRow(instanceData.rowData, instanceData.rowIndex);
  }
  // IDs are always assigned into data.id, so even their unassigned reads can stay warm.
  // Other unset new fields stay cold: inserts may supply defaults later, without a read
  // turning into an explicit `undefined` for defaults/isFieldSet.
  if (shouldMarkReadField && (fieldName === "id" || fieldName in data) && (!isInternal || !field?.assertUnchanged)) {
    markApplicationReadField(entity, index, true);
  }
  return data[fieldName];
}

/**
 * Invokes cold-read hooks without letting a reentrant read authorize the outer read.
 *
 * The active-field guard permits synchronous hook reentrancy without caching its approval.
 * The entity's read-word descriptors discard untrusted warm-bit writes from the shared read path.
 */
function runFieldReadHooks(entity: Entity, instanceData: InstanceData, fieldName: string): boolean {
  const plugins = getEmInternalApi(instanceData.em).pluginManager;
  if (!plugins.hasHook("beforeGetField")) return true;

  if (instanceData.activeReadFields?.has(fieldName)) return false;
  if (instanceData.trustedReadFields && isInTrustedContext()) return true;
  const active = (instanceData.activeReadFields ??= new Set<string>());
  active.add(fieldName);
  try {
    plugins.beforeGetField(entity, fieldName);
    return true;
  } catch (error) {
    // A reentrant ID getter may have cached a conversion before the outer hook failed.
    if (fieldName === "id") instanceData.idCache = undefined;
    throw error;
  } finally {
    active.delete(fieldName);
  }
}

/** Tests a field bit without allocating the extra words for small entity types. */
function hasReadField(first: number, extra: readonly number[] | undefined, index: number): boolean {
  const word = index < 32 ? first : (extra?.[(index >>> 5) - 1] ?? 0);
  return (word & (1 << (index & 31))) !== 0;
}

/** Changes the entity's warm-read bit without disturbing other fields in that word. */
function markApplicationReadField(entity: Entity, index: number, read: boolean): void {
  const bit = 1 << (index & 31);
  const word = index >>> 5;
  const value = getFieldReadWord(entity, word);
  setFieldReadWord(entity, word, read ? value | bit : value & ~bit);
}

/** Reads the same warm-read words used by generated getters. */
function getFieldReadWord(entity: Entity, word: number): number {
  return (entity as EntityReadWords)[readWordName(word)];
}

/** Updates a warm-read word without exposing an entity API. */
function setFieldReadWord(entity: Entity, word: number, value: number): void {
  (entity as EntityReadWords)[readWordName(word)] = value;
}

/** Matches the literal names emitted by codegen; only shared reads construct a word name. */
function readWordName(word: number): ReadWordName {
  return word === 0 ? "__readFields" : `__readFields${word}`;
}

import { isAlias } from "../Aliases";
import { isEntity } from "../Entity";
import { isReference } from "../relations";
import { maybeRequireTemporal } from "../temporal";
import { plainDateMapper, plainDateTimeMapper, plainTimeMapper, zonedDateTimeMapper } from "../temporalMappers";

const Temporal = maybeRequireTemporal()?.Temporal;

/**
 * Returns a fast stable key for find filters.
 *
 * This avoids `object-hash` for simple find filters; the phase 8 query-prep benchmark saw 1,000-query p50s drop
 * from ~22-26ms to ~7.6-10.9ms, with heap allocation dropping from ~24-30MB to ~10-16MB.
 *
 * We also benchmarked native/WASM non-cryptographic hash libraries, but they only hash bytes; they still need this
 * deterministic serialization first. For 1,000 filter keys, this helper alone had p50s of 0.337/0.353/0.410ms vs.
 * object-hash md5 at 7.467/7.436/7.620ms, and wrapping this key with native hashes was slower: farmhash
 * fingerprint64 at 0.517/0.524/0.538ms, @node-rs/xxhash xxh3-128 at 0.611/0.613/0.627ms, and xxhash-addon
 * XXH128 at 1.031/1.078/1.348ms. So the stable serialization is the necessary work, and keeping it as the cache
 * key avoids extra native-call/digest overhead and avoids introducing probabilistic hash collisions.
 */
export function fastWhereFilterHash(value: unknown): string | undefined {
  return appendStableValue("", value, new WeakSet<object>());
}

/** Appends a deterministic, type-tagged representation of `value` to `key`. */
function appendStableValue(key: string, value: unknown, seen: WeakSet<object>): string | undefined {
  if (value === undefined) return `${key}u;`;
  if (value === null) return `${key}n;`;
  switch (typeof value) {
    case "string":
      return `${key}s${value.length}:${value};`;
    case "number":
      return `${key}d${value};`;
    case "boolean":
      return `${key}b${value ? 1 : 0};`;
    case "bigint":
      return `${key}i${value.toString()};`;
    case "object":
      return appendStableObject(key, value, seen);
    case "function":
      return isAlias(value) ? `${key}xalias;` : undefined;
    default:
      return undefined;
  }
}

/** Appends a deterministic, type-tagged representation of `value` to `key`. */
function appendStableObject(key: string, value: object, seen: WeakSet<object>): string | undefined {
  if (value instanceof Date) return `${key}t${value.toISOString().length}:${value.toISOString()};`;
  if (ArrayBuffer.isView(value)) return appendArrayBufferView(key, value);

  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    key = `${key}a${value.length}[`;
    for (const item of value) {
      const nextKey = appendStableValue(key, item, seen);
      if (nextKey === undefined) {
        seen.delete(value);
        return undefined;
      }
      key = nextKey;
    }
    seen.delete(value);
    return `${key}]`;
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);

    const keys = Object.keys(value).sort();
    key = `${key}o${keys.length}{`;
    for (const property of keys) {
      key = `${key}${property.length}:${property}=`;
      const nextKey = appendStableValue(key, (value as Record<string, unknown>)[property], seen);
      if (nextKey === undefined) {
        seen.delete(value);
        return undefined;
      }
      key = nextKey;
    }
    seen.delete(value);
    return `${key}}`;
  }

  if (isEntity(value)) return `${key}e${value.toString().length}:${value.toString()};`;
  const referenceKey = appendReferenceValue(key, value);
  if (referenceKey !== undefined) return referenceKey;
  const temporalValue = toTemporalDbValue(value);
  if (temporalValue !== undefined) return appendTemporalValue(key, temporalValue);
  const valueObjectKey = appendValueObject(key, value, seen);
  if (valueObjectKey !== undefined) return valueObjectKey;
  return undefined;
}

/** Appends an ArrayBuffer view by its exact byte contents. */
function appendArrayBufferView(key: string, value: ArrayBufferView): string {
  const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64");
  return `${key}y${value.constructor.name.length}:${value.constructor.name}:${bytes.length}:${bytes};`;
}

/** Appends a Joist reference by its tagged id. */
function appendReferenceValue(key: string, value: object): string | undefined {
  if (!isReference(value)) return undefined;
  const id = value.idTaggedMaybe;
  return id === undefined ? `${key}r;` : `${key}r${id.length}:${id};`;
}

/** Appends a custom value object by constructor name and enumerable properties. */
function appendValueObject(key: string, value: object, seen: WeakSet<object>): string | undefined {
  if (!isValueObject(value)) return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);

  const constructorName = value.constructor.name;
  const keys = Object.keys(value).sort();
  key = `${key}c${constructorName.length}:${constructorName}:${keys.length}{`;
  for (const property of keys) {
    key = `${key}${property.length}:${property}=`;
    const nextKey = appendStableValue(key, (value as Record<string, unknown>)[property], seen);
    if (nextKey === undefined) {
      seen.delete(value);
      return undefined;
    }
    key = nextKey;
  }
  seen.delete(value);
  return `${key}}`;
}

/** Appends a Temporal value as a distinct scalar type. */
function appendTemporalValue(key: string, value: string): string {
  return `${key}t${value.length}:${value};`;
}

/** Returns the db representation for Temporal values, or undefined for non-Temporal values. */
function toTemporalDbValue(value: object): string | undefined {
  if (!Temporal) return undefined;
  if (value instanceof Temporal.ZonedDateTime) return zonedDateTimeMapper.toDb(value);
  if (value instanceof Temporal.PlainDateTime) return plainDateTimeMapper.toDb(value);
  if (value instanceof Temporal.PlainDate) return plainDateMapper.toDb(value);
  if (value instanceof Temporal.PlainTime) return plainTimeMapper.toDb(value);
  return undefined;
}

/** Returns true for plain object literals used by find filters/settings. */
function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Returns true for custom value objects that can be represented by enumerable fields. */
function isValueObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype !== Object.prototype && prototype !== null && Object.keys(value).length > 0;
}

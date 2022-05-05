import { BaseEntity } from "./BaseEntity";
import { Entity, EntityConstructor, getMetadata } from "./EntityManager";
import { fail } from "./utils";

const tagDelimiter = ":";

// I'm not entirely sure this is still necessary, but use a small subset of EntityMetadata so
// that this file doesn't have to import the type and potentially create import cycles.
type HasTagName = { tagName: string | undefined; idType: "int" | "uuid" };

// Before a referred-to object is saved, we keep its instance in our data
// map, and then assume it will be persisted before we're asked to persist
export function maybeResolveReferenceToId(value: any): string | undefined {
  return typeof value === "number" || typeof value === "string" ? value : value?.id;
}

/** Converts `value` to a number, i.e. for string ids, unless its undefined. */
export function keyToNumber(meta: HasTagName, value: string | number): number;
export function keyToNumber(meta: HasTagName, value: string | number | undefined): number | undefined;
export function keyToNumber(meta: HasTagName, value: any): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  } else if (typeof value === "number") {
    return value;
  } else if (typeof value === "string") {
    const [tag, id] = value.split(tagDelimiter);
    if (id === undefined) {
      return maybeNumberUnlessUuid(meta, value);
    }
    if (meta.tagName !== undefined && tag !== meta.tagName) {
      throw new Error(`Invalid tagged id, expected tag ${meta.tagName}, got ${value}`);
    }
    return maybeNumberUnlessUuid(meta, id);
  } else {
    throw new Error(`Invalid key ${value}`);
  }
}

// If we're using UUIDs, just lie to the type system and pretend they're numbers.
function maybeNumberUnlessUuid(meta: HasTagName, key: string): number {
  if (meta.idType === "uuid") {
    return key as any;
  }
  return Number(key);
}

/** Converts `value` to a tagged string, i.e. for string ids, unless its undefined. */
export function keyToString(meta: HasTagName, value: any): string | undefined {
  return value === undefined || value === null ? undefined : `${meta.tagName}:${value}`;
}

/** Fails if any keys are tagged; used by internal functions b/c we still allow most direct API input to be untagged. */
export function assertIdsAreTagged(keys: readonly string[]): void {
  const invalidKeys = keys.filter((k) => k.indexOf(tagDelimiter) === -1);
  if (invalidKeys.length > 0) {
    throw new Error(`Some keys are missing tags ${invalidKeys}`);
  }
}

/** Tags a potentially untagged id, while our API inputs still accept either tagged or untagged ids. */
export function tagId(meta: HasTagName, id: string | number): string;
export function tagId(cstr: EntityConstructor<any>, id: string | number): string;
export function tagId(meta: HasTagName, id: string | number | null | undefined): string | undefined;
export function tagId(cstr: EntityConstructor<any>, id: string | number | null | undefined): string | undefined;
export function tagId(
  metaOrCstr: HasTagName | EntityConstructor<any>,
  id: string | number | null | undefined,
): string | undefined {
  if (id === null || id === undefined) {
    return undefined;
  }

  if (!(typeof metaOrCstr === "function" ? getMetadata(metaOrCstr).tagName : metaOrCstr.tagName)) {
    return String(id);
  }

  if (typeof id === "number") {
    return `${tagName(metaOrCstr)}${tagDelimiter}${id}`;
  }

  if (id.includes(tagDelimiter)) {
    const [tag] = id.split(tagDelimiter);
    if (tag !== tagName(metaOrCstr)) {
      throw new Error(`Invalid tagged id, expected tag ${tagName(metaOrCstr)}, got ${id}`);
    }
    return id;
  }
  return `${tagName(metaOrCstr)}${tagDelimiter}${id}`;
}

/** Adds the tag prefixes. */
export function tagIds(meta: HasTagName, keys: readonly (string | number)[]): readonly string[];
export function tagIds(cstr: EntityConstructor<any>, keys: readonly (string | number)[]): readonly string[];
export function tagIds(
  metaOrCstr: HasTagName | EntityConstructor<any>,
  keys: readonly (string | number)[],
): readonly string[] {
  return keys.map((k) => tagId(metaOrCstr as any, k));
}

export function deTagId(meta: HasTagName, id: string | number): string;
export function deTagId(entity: Entity): string;
export function deTagId(entityOrMeta: Entity | HasTagName, id?: string | number): string {
  const meta = entityOrMeta instanceof BaseEntity ? getMetadata(entityOrMeta) : (entityOrMeta as HasTagName);
  id = id ?? (entityOrMeta as Entity).id;
  return keyToNumber(meta, id!).toString();
}

/** Removes the tag prefixes so we can use the keys for SQL operations. */
export function deTagIds(meta: HasTagName, keys: readonly string[]): readonly string[] {
  return keys.map((k) => deTagId(meta, k));
}

/** Removes the tag prefixes so we can use the keys for SQL operations. */
export function unsafeDeTagIds(keys: readonly string[]): readonly string[] {
  return keys.map((k) => k.split(tagDelimiter)).map((t) => (t.length === 0 ? t[0] : t[1]));
}

/** Given a tagged id, returns its tag. */
export function tagFromId(key: string): string {
  const parts = key.split(tagDelimiter);
  if (parts.length !== 2) {
    fail(`Unknown tagged id format: "${key}"`);
  }
  return parts[0];
}

function tagName(metaOrCstr: HasTagName | EntityConstructor<any>): string | undefined {
  return typeof metaOrCstr === "function" ? getMetadata(metaOrCstr).tagName : metaOrCstr.tagName;
}

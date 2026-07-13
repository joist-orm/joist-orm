import { BaseEntity } from "./BaseEntity";
import { type Entity, type IdType, isEntity } from "./Entity";
import { type EntityConstructor, type IdOf, type TaggedId } from "./EntityManager";
import { type EntityMetadata, getMetadata } from "./EntityMetadata";
import { type Reference } from "./relations";
import { assertNever, fail } from "./utils";

let tagDelimiter: string | undefined = ":";

/** Sets the process-wide tagged-id format during metadata boot. */
export function setTaggedIdDelimiter(delimiter: string | undefined): void {
  tagDelimiter = delimiter;
}

// I'm not entirely sure this is still necessary, but use a small subset of EntityMetadata so
// that this file doesn't have to import the type and potentially create import cycles.
type HasTagName = {
  tagName: string;
  /** The database column type, i.e. used to do `::type` casts in Postgres. */
  idDbType: "bigint" | "int" | "uuid" | "text";
};

/** Converts our internal/always-tagged `id` to the domain entity's `id` type (could be a number or uuid). */
export function toIdOf<T extends Entity>(meta: EntityMetadata<T>, id: TaggedId | undefined): IdOf<T> | undefined {
  if (!id) return undefined;
  switch (meta.idType) {
    case "number":
      return Number(deTagId(meta, id)) as IdOf<T>;
    case "tagged-string":
      return id as IdOf<T>;
    case "untagged-string":
      return deTagId(meta, id) as IdOf<T>;
    default:
      return assertNever(meta.idType);
  }
}

// Before a referred-to object is saved, we keep its instance in our data
// map, and then assume it will be persisted before we're asked to persist
export function maybeResolveReferenceToId(
  value: Entity | Reference<any, any, any> | string | undefined,
): TaggedId | undefined {
  return typeof value === "string" ? value : value?.idTaggedMaybe;
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
    if (tagDelimiter === undefined) {
      const id = value.startsWith(meta.tagName) ? value.slice(meta.tagName.length) : value;
      return maybeNumberUnlessUuid(meta, id);
    }
    const delimiterIndex = value.indexOf(tagDelimiter);
    if (delimiterIndex === -1) {
      return maybeNumberUnlessUuid(meta, value);
    }
    const tag = value.slice(0, delimiterIndex);
    if (tag !== meta.tagName) {
      throw new Error(`Invalid tagged id, expected tag ${meta.tagName}, got ${value}`);
    }
    return maybeNumberUnlessUuid(meta, value.slice(delimiterIndex + tagDelimiter.length));
  } else {
    throw new Error(`Invalid key ${value}`);
  }
}

// UUIDs, text, and bigints are strings at the database boundary, so lie to the type system and pretend they're numbers.
function maybeNumberUnlessUuid(meta: HasTagName, key: string): number {
  switch (meta.idDbType) {
    case "bigint":
    case "uuid":
    case "text":
      return key as any;
    case "int":
      return Number(key);
    default:
      assertNever(meta.idDbType);
  }
}

/** Converts `dbValue` (big int, int, uuid) to a tagged string, unless its undefined. */
export function keyToTaggedId(meta: HasTagName, dbValue: string | number): TaggedId | undefined {
  if (dbValue === undefined || dbValue === null) return undefined;
  return `${meta.tagName}${tagDelimiter ?? ""}${dbValue}`;
}

/** Fails if any keys are untagged; internal batch-loader keys must always be tagged. */
export function assertIdsAreTagged(keys: readonly string[]): void {
  for (const key of keys) {
    const isTagged = tagDelimiter === undefined ? validSlugId.test(key) : key.indexOf(tagDelimiter) !== -1;
    if (!isTagged) throw new Error(`Key ${key} is missing a tag`);
  }
}

const validSlugId = /^([a-z]+)(\d+)$/i;
const uuidIshId = /[0-9a-z\-]+/i;

/** Returns whether `id` is tagged and a probably-correct value. */
export function isTaggedId(id: string | number): boolean;
/** Returns whether `id` is tagged and the tag matches `meta`'s tag. */
export function isTaggedId(meta: EntityMetadata, id: string): boolean;
export function isTaggedId(metaOrId: string | number | HasTagName, id?: string): boolean {
  if (typeof metaOrId === "number") {
    // number overload
    return false;
  } else if (typeof metaOrId === "string") {
    // string overload
    return tagDelimiter === undefined ? validSlugId.test(metaOrId) : hasTagDelimiter(metaOrId);
  } else {
    // meta + string overload
    return isTaggedIdForMeta(metaOrId, id!);
  }
}

export function assertIdIsTagged(id: string): void {
  if (!isTaggedId(id)) {
    throw new Error(`Key is not tagged ${id}`);
  }
}

/** We accept an entity in case this is m2o storing a not-yet-saved entity. */
export function toTaggedId(meta: HasTagName, id: IdType): TaggedId;
export function toTaggedId(meta: HasTagName, id: IdType | undefined): TaggedId | undefined;
export function toTaggedId(meta: HasTagName, id: IdType | undefined): TaggedId | undefined {
  if (typeof id === "number") {
    return `${meta.tagName}${tagDelimiter ?? ""}${id}`;
  } else if (typeof id === "string") {
    // This seems odd, but is covered by a unit test, so I guess we need it?
    if (id === "") return undefined;
    if (tagDelimiter === undefined) {
      const tag = validSlugId.exec(id)?.[1];
      if (tag && tag !== meta.tagName) {
        throw new Error(`Invalid tagged id, expected tag ${meta.tagName}, got ${id}`);
      }
      return tag ? id : `${meta.tagName}${id}`;
    } else {
      const i = id.indexOf(tagDelimiter);
      if (i === -1) return `${meta.tagName}${tagDelimiter}${id}`;
      const tag = id.slice(0, i);
      if (tag !== meta.tagName) {
        throw new Error(`Invalid tagged id, expected tag ${meta.tagName}, got ${id}`);
      }
    }
  }
  return id;
}

/** Similar to `toTaggedId`, but we accept an entity for handling relations to not-yet-saved entities. */
export function ensureTagged<T extends Entity>(
  meta: HasTagName,
  value: T | string | number | undefined,
): T | TaggedId | undefined {
  return isEntity(value) ? value : toTaggedId(meta, value);
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
  const meta = metadata(metaOrCstr);
  const tag = meta.tagName;
  if (typeof id === "number") {
    return `${tag}${tagDelimiter ?? ""}${id}`;
  }
  if (id === null || id === undefined) {
    return undefined;
  }
  if (tagDelimiter === undefined) {
    const existingTag = validSlugId.exec(id)?.[1];
    if (existingTag && existingTag !== tag) {
      throw new Error(`Invalid tagged id, expected tag ${tag}, got ${id}`);
    }
    return existingTag ? id : `${tag}${id}`;
  }
  // Avoid using includes/split, for a faster indexOf + length + startsWith
  const delimiterIndex = id.indexOf(tagDelimiter);
  if (delimiterIndex !== -1) {
    if (delimiterIndex !== tag.length || !id.startsWith(tag)) {
      throw new Error(`Invalid tagged id, expected tag ${tag}, got ${id}`);
    }
    return id;
  }
  return `${tag}${tagDelimiter}${id}`;
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
export function deTagId(meta: HasTagName, id: string | number | undefined): string | undefined;
export function deTagId(entity: Entity): string;
export function deTagId(entityOrMeta: Entity | HasTagName, id?: string | number): string | undefined {
  const meta = entityOrMeta instanceof BaseEntity ? getMetadata(entityOrMeta) : (entityOrMeta as HasTagName);
  id = id ?? (entityOrMeta as Entity).id;
  return id === undefined ? undefined : keyToNumber(meta, id).toString();
}

/** Removes the tag prefixes so we can use the keys for SQL operations. */
export function deTagIds(meta: HasTagName, keys: readonly string[]): readonly string[] {
  const deTagged = Array(keys.length);
  for (let i = 0; i < keys.length; i++) deTagged[i] = deTagId(meta, keys[i]);
  return deTagged;
}

/** Removes the tag prefixes so we can use the keys for SQL operations. */
export function unsafeDeTagIds(keys: readonly string[]): readonly string[] {
  const deTagged = Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    if (tagDelimiter === undefined) {
      deTagged[i] = validSlugId.exec(keys[i])?.[2];
    } else {
      const delimiterIndex = keys[i].indexOf(tagDelimiter);
      deTagged[i] = delimiterIndex === -1 ? undefined : keys[i].slice(delimiterIndex + tagDelimiter.length);
    }
  }
  return deTagged;
}

/** Given a tagged id, returns its tag. */
export function tagFromId(id: string): string {
  if (tagDelimiter === undefined) {
    return validSlugId.exec(id)?.[1] ?? fail(`Unknown tagged id format: "${id}"`);
  }
  const delimiterIndex = id.indexOf(tagDelimiter);
  return delimiterIndex > 0 && delimiterIndex + tagDelimiter.length < id.length
    ? id.slice(0, delimiterIndex)
    : fail(`Unknown tagged id format: "${id}"`);
}

/** Returns the metadata needed to format an id. */
function metadata(metaOrCstr: HasTagName | EntityConstructor<any>): HasTagName {
  return typeof metaOrCstr === "function" ? getMetadata(metaOrCstr) : metaOrCstr;
}

/** Returns whether `id` has the tag and database id shape required by `meta`. */
function isTaggedIdForMeta(meta: HasTagName, id: string): boolean {
  if (tagDelimiter === undefined) {
    return validSlugId.exec(id)?.[1] === meta.tagName;
  }
  const delimiterIndex = id.indexOf(tagDelimiter);
  if (delimiterIndex === -1) return false;
  const tag = id.slice(0, delimiterIndex);
  const untaggedId = id.slice(delimiterIndex + tagDelimiter.length);
  if (meta.tagName !== tag) return false;
  switch (meta.idDbType) {
    case "int":
    case "bigint":
      return !Number.isNaN(Number(untaggedId));
    case "uuid":
      return uuidIshId.test(untaggedId);
    case "text":
      return true;
    default:
      return assertNever(meta.idDbType);
  }
}

/** Returns whether `id` has a non-empty tag and value separated by the configured delimiter. */
function hasTagDelimiter(id: string): boolean {
  if (tagDelimiter === undefined) return false;
  const delimiterIndex = id.indexOf(tagDelimiter);
  return delimiterIndex > 0 && delimiterIndex + tagDelimiter.length < id.length;
}

import { BaseEntity } from "./BaseEntity";
import { Entity, IdType, isEntity } from "./Entity";
import { EntityConstructor, IdOf, TaggedId } from "./EntityManager";
import { EntityMetadata, getMetadata } from "./EntityMetadata";
import { Reference } from "./relations";
import { assertNever, fail } from "./utils";

const tagDelimiter = ":";

// I'm not entirely sure this is still necessary, but use a small subset of EntityMetadata so
// that this file doesn't have to import the type and potentially create import cycles.
type HasTagName = {
  tagName: string;
  /** The type of the `id` field on the domain entity. */
  // idType: "tagged-string" | "untagged-string" | "number";
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
    const [tag, id] = value.split(tagDelimiter);
    if (id === undefined) {
      return maybeNumberUnlessUuid(meta, value);
    }
    if (tag !== meta.tagName) {
      throw new Error(`Invalid tagged id, expected tag ${meta.tagName}, got ${value}`);
    }
    return maybeNumberUnlessUuid(meta, id);
  } else {
    throw new Error(`Invalid key ${value}`);
  }
}

// If we're using UUIDs, just lie to the type system and pretend they're numbers.
function maybeNumberUnlessUuid(meta: HasTagName, key: string): number {
  switch (meta.idDbType) {
    case "uuid":
    case "text":
      return key as any;
    case "int":
    case "bigint":
      return Number(key);
    default:
      assertNever(meta.idDbType);
  }
}

/** Converts `dbValue` (big int, int, uuid) to a tagged string, unless its undefined. */
export function keyToTaggedId(meta: HasTagName, dbValue: string | number): TaggedId | undefined {
  return dbValue === undefined || dbValue === null ? undefined : `${meta.tagName}:${dbValue}`;
}

/** Fails if any keys are tagged; used by internal functions b/c we still allow most direct API input to be untagged. */
export function assertIdsAreTagged(keys: readonly string[]): void {
  for (const key of keys) {
    if (key.indexOf(tagDelimiter) === -1) throw new Error(`Key ${key} is missing a tag`);
  }
}

// Either `tag:int` or `tag:uuid`.
const validId = /[a-z]+:([0-9a-z\-]+)/;
// Not super strict to allow uuid-ish ides
const uuidIshId = /[0-9a-z\-]+/i;

/** Returns whether `id` is tagged and a probably-correct value. */
export function isTaggedId(id: string | number): boolean;
/** Returns whether `id` is tagged and the tag matches `meta`'s tag. */
export function isTaggedId(meta: EntityMetadata, id: string): boolean;
export function isTaggedId(metaOrId: string | number | EntityMetadata, id?: string): boolean {
  if (typeof metaOrId === "number") {
    return false;
  } else if (typeof metaOrId === "string") {
    return validId.test(metaOrId);
  } else {
    const [tag, _id] = id!.split(tagDelimiter);
    if (metaOrId.tagName !== tag) return false;
    // With meta available, we can do more strict number or uuid checking
    if (metaOrId.idDbType === "int" || metaOrId.idDbType === "bigint") {
      return !Number.isNaN(Number(_id));
    } else if (metaOrId.idDbType === "uuid") {
      return uuidIshId.test(_id);
    } else if (metaOrId.idDbType === "text") {
      return true; // We should ask the IdAssigner what it thinks?
    } else {
      return assertNever(metaOrId.idDbType);
    }
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
    return `${meta.tagName}${tagDelimiter}${id}`;
  } else if (typeof id === "string") {
    // This seems odd, but is covered by a unit test, so I guess we need it?
    if (id === "") return undefined;
    const i = id.indexOf(tagDelimiter);
    if (i === -1) return `${meta.tagName}${tagDelimiter}${id}`;
    const tag = id.slice(0, i);
    if (tag !== meta.tagName) throw new Error(`Invalid tagged id, expected tag ${meta.tagName}, got ${id}`);
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
  if (typeof id === "number") {
    return `${tagName(metaOrCstr)}${tagDelimiter}${id}`;
  }
  if (id === null || id === undefined) {
    return undefined;
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
    const maybeTagged = keys[i].split(tagDelimiter);
    deTagged[i] = maybeTagged.length === 0 ? maybeTagged[0] : maybeTagged[1];
  }
  return deTagged;
}

/** Given a tagged id, returns its tag. */
export function tagFromId(id: string): string {
  const parts = id.split(tagDelimiter);
  if (parts.length !== 2) {
    fail(`Unknown tagged id format: "${id}"`);
  }
  return parts[0];
}

function tagName(metaOrCstr: HasTagName | EntityConstructor<any>): string {
  return typeof metaOrCstr === "function" ? getMetadata(metaOrCstr).tagName : metaOrCstr.tagName;
}

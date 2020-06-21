const tagDelimiter = ":";

// I'm not entirely sure this is still necessary, but use a small subset of EntityMetadata so
// that this file doesn't have to import the type and potentially create import cycles.
type HasTagName = { tagName: string };

// Before a referred-to object is saved, we keep its instance in our data
// map, and then assume it will be persisted before we're asked to persist
export function maybeResolveReferenceToId(value: any): string | undefined {
  return typeof value === "number" || typeof value === "string" ? value : value?.id;
}

/** Converts `value` to a number, i.e. for string ids, unless its undefined. */
export function keyToNumber(meta: HasTagName, value: string): number;
export function keyToNumber(meta: HasTagName, value: any): number | undefined;
export function keyToNumber(meta: HasTagName, value: any): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  } else if (typeof value === "number") {
    return value;
  } else if (typeof value === "string") {
    const [tag, id] = value.split(tagDelimiter);
    if (id === undefined) {
      return Number(value);
    }
    if (tag !== meta.tagName) {
      throw new Error(`Invalid tagged id, expected tag ${meta.tagName}, got ${value}`);
    }
    return Number(id);
  } else {
    throw new Error(`Invalid key ${value}`);
  }
}

/** Converts `value` to a number, i.e. for string ids, unles its undefined. */
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
export function tagIfNeeded(meta: HasTagName, id: string): string {
  if (id.includes(tagDelimiter)) {
    return id;
  }
  return `${meta.tagName}${tagDelimiter}${id}`;
}

/** Removes the tag prefixes so we can use the keys for SQL operations. */
export function deTagIds(meta: HasTagName, keys: readonly string[]): readonly string[] {
  return keys.map((k) => keyToNumber(meta, k)).map((n) => n.toString());
}

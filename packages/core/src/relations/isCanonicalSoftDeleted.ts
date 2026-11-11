import type { Entity } from "src/Entity.ts";
import { getBaseMeta, getMetadata } from "src/EntityMetadata.ts";
import { getFieldCanonical } from "src/fields.ts";

/** Soft-delete filtering is canonical bookkeeping, not a public read of the deletion timestamp. */
export function isCanonicalSoftDeleted(entity: Entity): boolean {
  const field = getBaseMeta(getMetadata(entity)).timestampFields?.deletedAt;
  return field !== undefined && getFieldCanonical(entity, field) !== undefined;
}

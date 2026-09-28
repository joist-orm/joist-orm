import { getBaseAndSelfMetas, getMetadata } from "src/EntityMetadata.ts";
import type { AbstractRelationImpl } from "src/relations/AbstractRelationImpl.ts";

// Keep metadata imports out of AbstractRelationImpl so query imports cannot evaluate a relation
// subclass before its base class has initialized.
/** Returns whether this relation is configured for cascade deletion on the entity or a base type. */
export function isCascadeDelete(relation: AbstractRelationImpl<any, any>, fieldName: string): boolean {
  return getBaseAndSelfMetas(getMetadata(relation.entity)).some((meta) =>
    meta.config.__data.cascadeDeleteFields.includes(fieldName as any),
  );
}

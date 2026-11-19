import { getInstanceData } from "../BaseEntity.ts";
import { type EntityManager, getEmInternalApi } from "../EntityManager.ts";
import { getBaseMeta, getMetadata } from "../EntityMetadata.ts";
import { getField } from "../fields.ts";
import type { ManyToManyLike } from "../flush/JoinRows.ts";
import { type SessionValue, encodeField, encodeValue, sessionId } from "./json.ts";

export interface SessionChange {
  id: string;
  type: string;
  kind: "create" | "update" | "delete" | "touch";
  touched: boolean;
  fields: Record<string, SessionFieldChange>;
  relationships: Record<string, { added: SessionValue[]; removed: SessionValue[] }>;
}

export interface SessionFieldChange {
  oldValue: SessionValue;
  newValue: SessionValue;
}

/**
 * Captures retained ORM tracking after a dry run, without inferring domain changes from SQL.
 *
 * I.e. originalData.firstName = "Alice" and data.firstName = "Bob" become the update's original/new values.
 * New entities use client IDs even after speculative SQL has assigned database IDs.
 */
export function captureSessionChanges(em: EntityManager): SessionChange[] {
  const result: SessionChange[] = [];
  for (const entity of em.entities) {
    if (entity.isNewEntity && entity.isDeletedEntity) continue;
    const data = getInstanceData(entity);
    const meta = getMetadata(entity);
    const timestamps = getBaseMeta(meta).timestampFields;
    const fields: Record<string, SessionFieldChange> = {};
    const relationships: SessionChange["relationships"] = {};

    for (const field of Object.values(meta.allFields)) {
      const name = field.fieldName;
      if (field.kind === "primaryKey") continue;
      if (field.serde && (entity.isNewEntity || entity.isDeletedEntity || name in data.originalData)) {
        const current = getField(entity, name);
        const original = name in data.originalData ? data.originalData[name] : current;
        fields[name] = {
          oldValue: entity.isNewEntity ? null : encodeField(em, field, original),
          newValue: entity.isDeletedEntity ? null : encodeField(em, field, current),
        };
      } else if (!entity.isDeletedEntity && (field.kind === "m2m" || field.kind === "m2mEnum")) {
        const relation = (entity as unknown as Record<string, unknown>)[name] as ManyToManyLike;
        const rows = getEmInternalApi(em).joinRows(relation);
        const added = rows.addedFor(relation, entity);
        const removed = rows.removedFor(relation, entity);
        if (added.length || removed.length) {
          relationships[name] = {
            added: added.map(encodeValue),
            removed: removed.map(encodeValue),
          };
        }
      }
    }

    const hasAnyChanges =
      entity.isNewEntity ||
      entity.isDeletedEntity ||
      data.isTouched ||
      Object.keys(fields).length > 0 ||
      Object.keys(relationships).length > 0;
    if (!hasAnyChanges) continue;

    result.push({
      id: sessionId(entity),
      type: meta.type,
      kind: entity.isNewEntity
        ? "create"
        : entity.isDeletedEntity
          ? "delete"
          : data.isTouched &&
              Object.keys(fields).every((name) => name === timestamps?.createdAt || name === timestamps?.updatedAt)
            ? "touch"
            : "update",
      touched: data.isTouched,
      fields,
      relationships,
    });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

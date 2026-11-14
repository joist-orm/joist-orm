import { getInstanceData } from "../BaseEntity.ts";
import { type Entity, isEntity } from "../Entity.ts";
import { getEmInternalApi } from "../EntityManager.ts";
import { type Field, getBaseMeta, getMetadata } from "../EntityMetadata.ts";
import { getField } from "../fields.ts";
import type { ManyToManyLike } from "../flush/JoinRows.ts";
import type { SessionChange, SessionExecution, SessionFieldChange, SessionValue } from "./types.ts";

/**
 * Captures retained ORM tracking after a dry run, without inferring domain changes from SQL.
 *
 * I.e. originalData.firstName = "Alice" and data.firstName = "Bob" become the update's original/new values.
 * References to explicit creations use log keys even after speculative SQL has assigned database IDs.
 */
export function captureSessionChanges(execution: SessionExecution): SessionChange[] {
  const result: SessionChange[] = [];
  for (const entity of execution.em.entities) {
    if (entity.isNewEntity && entity.isDeletedEntity) continue;
    const data = getInstanceData(entity);
    const meta = getMetadata(entity);
    const timestamps = getBaseMeta(meta).timestampFields;
    const timestampFields = [timestamps?.createdAt, timestamps?.updatedAt].filter(
      (name): name is string => name !== undefined,
    );
    const fields: Record<string, SessionFieldChange> = {};
    const relationships: SessionChange["relationships"] = {};

    for (const field of Object.values(meta.allFields)) {
      const name = field.fieldName;
      if (field.kind === "primaryKey") continue;
      if (field.serde && (entity.isNewEntity || entity.isDeletedEntity || name in data.originalData)) {
        const current = getField(entity, name);
        const original = name in data.originalData ? data.originalData[name] : current;
        fields[name] = {
          originalValue: entity.isNewEntity ? null : encodeField(execution, field, original),
          newValue: entity.isDeletedEntity ? null : encodeField(execution, field, current),
        };
      } else if (!entity.isDeletedEntity && (field.kind === "m2m" || field.kind === "m2mEnum")) {
        const relation = (entity as unknown as Record<string, unknown>)[name] as ManyToManyLike;
        const rows = getEmInternalApi(execution.em).joinRows(relation);
        const added = rows.addedFor(relation, entity);
        const removed = rows.removedFor(relation, entity);
        if (added.length || removed.length) {
          relationships[name] = {
            added: added.map((value) => encodeSessionValue(execution, value)),
            removed: removed.map((value) => encodeSessionValue(execution, value)),
          };
        }
      }
    }

    if (
      !entity.isNewEntity &&
      !entity.isDeletedEntity &&
      !data.isTouched &&
      !Object.keys(fields).length &&
      !Object.keys(relationships).length
    )
      continue;
    result.push({
      ref: sessionRef(execution, entity),
      type: meta.type,
      kind: entity.isNewEntity
        ? "create"
        : entity.isDeletedEntity
          ? "delete"
          : data.isTouched && Object.keys(fields).every((name) => timestampFields.includes(name))
            ? "touch"
            : "update",
      touched: data.isTouched,
      fields,
      timestampFields,
      relationships,
    });
  }
  return result.sort((a, b) => a.ref.localeCompare(b.ref));
}

/** Uses logged creation keys rather than provisional database IDs, including inside relationships. */
export function sessionRef(execution: SessionExecution, entity: Entity): string {
  const explicit = execution.refs.get(entity);
  if (explicit) return explicit;
  if (!entity.isNewEntity) return entity.idTagged;
  // Hook creations have diagnostic identities only; commands cannot target them.
  const siblings = execution.em.entities.filter(
    (other) => other.isNewEntity && !execution.refs.has(other) && getMetadata(other).type === getMetadata(entity).type,
  );
  return `@${getMetadata(entity).type}:${siblings.indexOf(entity) + 1}`;
}

/** Serializes supported domain values without calling entity.toJSON or returning live objects. */
export function encodeSessionValue(execution: SessionExecution, value: unknown): SessionValue {
  if (value === undefined || value === null) return null;
  if (isEntity(value)) return { ref: sessionRef(execution, value) };
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((entry) => encodeSessionValue(execution, entry));
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encodeSessionValue(execution, entry)]));
  }
  throw new Error("Session prototype cannot serialize this domain value");
}

/** Preserves reference identity even when tracking contains an unloaded foreign-key ID. */
function encodeField(execution: SessionExecution, field: Field, value: unknown): SessionValue {
  if ((field.kind === "m2o" || field.kind === "poly") && value !== undefined && value !== null && !isEntity(value)) {
    const loaded = execution.em.getEntity(String(value));
    return { ref: loaded ? sessionRef(execution, loaded) : String(value) };
  }
  return encodeSessionValue(execution, value);
}

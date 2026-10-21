import { getInstanceData } from "src/BaseEntity.ts";
import { type Entity, isEntity } from "src/Entity.ts";
import type { EntityManager } from "src/EntityManager.ts";
import { getBaseMeta, getMetadata } from "src/EntityMetadata.ts";
import { getField } from "src/fields.ts";
import { keyToNumber } from "src/keys.ts";
import type { LoadHint } from "src/loading/loadHints.ts";
import { normalizeHint } from "src/normalizeHints.ts";
import { kq } from "src/queries/sql/keywords.ts";
import { getRelationFromMaybePolyKey } from "src/reactivity/reactiveHints.ts";
import { getRuntimeConfig } from "src/runtimeConfig.ts";

/** A read-only dependency changed after it was loaded; retry the unit of work in a fresh EM. */
export class ReadDriftError extends Error {
  constructor(readonly drifts: readonly ReadDrift[]) {
    super(
      `Read drift: ${drifts.map((d) => `${d.id} expected ${d.expected}, actual ${d.actual ?? "missing"}`).join("; ")}`,
    );
    this.name = "ReadDriftError";
  }
}

export type ReadDrift = { id: string; expected: string; actual: string | undefined };

/**
 * Locks read-only dependencies in table/id order and checks the same version used by oplocks.
 *
 * Untouched versions are still the loaded field value; originalData retains that value if a
 * hook has changed the timestamp. Written entities are excluded before reading their bumped version.
 */
export async function checkReadDrift(
  em: EntityManager,
  readSet: Set<Entity>,
  written: Set<Entity>,
  checked: Set<Entity>,
): Promise<void> {
  const tables = new Map<string, Entity[]>();
  for (const entity of readSet) {
    if (entity.isNewEntity || written.has(entity) || checked.has(entity)) continue;
    const meta = getBaseMeta(getMetadata(entity));
    const group = tables.get(meta.tableName) ?? [];
    group.push(entity);
    tables.set(meta.tableName, group);
  }

  const drifts: ReadDrift[] = [];
  // Serial table acquisition also keeps multi-table assertions in a consistent lock order.
  for (const table of [...tables.keys()].sort()) {
    const entities = tables.get(table)!;
    const meta = getBaseMeta(getMetadata(entities[0]));
    const fieldName = meta.timestampFields!.updatedAt!;
    const column = meta.allFields[fieldName].serde!.columns[0];
    const idColumn = meta.allFields.id.serde!.columns[0];
    const ids = entities.map((e) => keyToNumber(meta, e.idTagged));
    // Text preserves Postgres microseconds for Temporal; Date oplocks intentionally compare milliseconds.
    const { rows } = await em.driver.executeQuery(
      em,
      `SELECT ${kq(idColumn.columnName)} AS id, ${kq(column.columnName)}::text AS version FROM ${kq(table)} WHERE ${kq(idColumn.columnName)} = ANY(?) ORDER BY ${kq(idColumn.columnName)} FOR SHARE`,
      [ids],
    );
    const versions = new Map(rows.map((row) => [String(row.id), row.version as string]));
    for (const entity of entities) {
      const data = getInstanceData(entity);
      const original =
        fieldName in data.originalData ? data.originalData[fieldName] : getField(entity, fieldName, true);
      const expected = String(column.mapToDbValue(original));
      const raw = versions.get(String(keyToNumber(meta, entity.idTagged)));
      const actualValue =
        raw === undefined ? undefined : column.mapFromDb(getRuntimeConfig().temporal ? raw : new Date(raw));
      const actual = actualValue === undefined ? undefined : String(column.mapToDbValue(actualValue));
      if (actualValue === undefined || versionKey(original) !== versionKey(actualValue)) {
        drifts.push({ id: entity.idTagged, expected, actual });
      }
      checked.add(entity);
    }
  }
  if (drifts.length > 0) throw new ReadDriftError(drifts);
}

/** Asserts each row reached by an already-populated hint, not collection membership or predicates. */
export function assertHintUnchanged<T extends Entity>(entity: T, hint: LoadHint<T>): void {
  entity.em.assertUnchanged(entity);
  for (const [key, subHint] of Object.entries(normalizeHint(hint))) {
    const relation = getRelationFromMaybePolyKey(entity, key);
    if (!relation || typeof relation !== "object" || !("get" in relation)) continue;
    const value: unknown = relation.get;
    const values: unknown[] = Array.isArray(value) ? value : [value];
    for (const reached of values) {
      if (isEntity(reached)) assertHintUnchanged(reached, subHint);
    }
  }
}

/** Compare instants independently of the timezone used to hydrate a Temporal.ZonedDateTime. */
function versionKey(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && "epochNanoseconds" in value) return String(value.epochNanoseconds);
  return String(value);
}

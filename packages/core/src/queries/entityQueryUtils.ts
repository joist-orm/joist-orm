import { type EntityMetadata, getBaseMeta } from "src/EntityMetadata.ts";
import type { ColumnCondition } from "src/queries/parsedConditions.ts";
import { kqDot } from "src/queries/sql/keywords.ts";

/**
 * Builds the primary table's SELECT columns explicitly, i.e. excluding any `lazy` columns.
 *
 * Only used when `meta.hasLazyColumns` is true; otherwise callers keep their plain `alias.*`, so
 * that entities without lazy columns emit byte-identical SQL to before this feature existed.
 */
export function lazyExcludedSelects(meta: EntityMetadata, alias: string): string[] {
  const selects: string[] = [];
  for (const field of Object.values(meta.fields)) {
    if (!field.serde) continue;
    if (field.kind === "primitive" && field.lazy) continue;
    for (const column of field.serde.columns) selects.push(kqDot(alias, column.columnName));
  }
  return selects;
}

/** Adds a deleted-at condition when the entity's soft-deleted rows should be excluded. */
export function maybeAddNotSoftDeleted(
  conditions: ColumnCondition[],
  meta: EntityMetadata,
  alias: string,
  softDeletes: "include" | "exclude",
): void {
  if (filterSoftDeletes(meta, softDeletes)) {
    const column = meta.allFields[getBaseMeta(meta).timestampFields!.deletedAt!].serde?.columns[0]!;
    conditions.push({
      kind: "column",
      alias,
      column: column.columnName,
      dbType: column.dbType,
      cond: { kind: "is-null" },
    });
  }
}

/** Returns whether the entity supports and requires soft-delete filtering for this query. */
export function filterSoftDeletes(meta: EntityMetadata, softDeletes: "include" | "exclude"): boolean {
  return (
    softDeletes === "exclude" &&
    !!getBaseMeta(meta).timestampFields?.deletedAt &&
    // We don't support CTI subtype soft-delete filtering yet
    (meta.inheritanceType !== "cti" || meta.baseTypes.length === 0)
  );
}

/** The `type_id = X` discriminator condition for an STI subtype, shared by em.find and em.query. */
export function stiSubtypeFilter(meta: EntityMetadata, alias: string): ColumnCondition | undefined {
  if (meta.inheritanceType !== "sti" || meta.stiDiscriminatorValue === undefined) return undefined;
  const baseMeta = getBaseMeta(meta);
  const column = baseMeta.fields[baseMeta.stiDiscriminatorField!].serde?.columns[0]!;
  return {
    kind: "column",
    alias,
    column: column.columnName,
    dbType: column.dbType,
    cond: { kind: "eq", value: meta.stiDiscriminatorValue },
    pruneable: true,
  };
}

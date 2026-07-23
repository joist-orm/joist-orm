/**
 * A read-only view of one query's result rows; each entity references its as-loaded row as a
 * `(rowData, rowIndex)` pair on its `InstanceData`.
 *
 * Each query result gets its own individual `RowData` — results are never combined or appended
 * across queries. An entity keeps pointing at the `RowData` of whichever query first loaded it
 * (or, for `em.refresh`, the query that most recently refreshed it), and the `RowData` is never
 * written to: mutations go into the entity's `data`/`originalData` bags as usual, so a `RowData`
 * stays a snapshot of "what the database returned for this query".
 *
 * This is the seam that lets rows be backed by different representations:
 *
 * - `PojoRowData` wraps the classic node-pg POJO rows, i.e. for the public
 *   `em.hydrate(type, rows)` API and drivers that return materialized rows, and
 * - lazy/columnar results (`WireRowData` in joist-orm, see `JS-ROW-STORE-DESIGN.md`) keep raw
 *   wire bytes in off-heap arenas and only decode a `row × column` cell when a field is read.
 *
 * Values returned from `get` are "driver-level" values, i.e. whatever the pg type
 * parsers produce (numbers for `int4`, parsed objects for `jsonb`, strings for
 * deferred temporals); the field serdes then convert them to domain values.
 */
export interface RowData {
  /** The number of rows in this query result. */
  readonly rowCount: number;
  /** Returns the driver-level column value for a row, i.e. `rowData.get(0, "first_name")`. */
  get(rowIndex: number, columnName: string): any;
  /** Materializes one row as a classic POJO, i.e. for legacy serdes or debugging. */
  toRow(rowIndex: number): any;
  /** Materializes classic POJO rows, i.e. for `afterFind` observation or debugging. */
  toRows(): any[];
  /** Optionally marks `rowIndex` as retained by a hydrated entity; see `finalize`. */
  retain?(rowIndex: number): void;
  /**
   * Optionally trims/compacts the result after hydration + sidecar reads are complete, i.e. so
   * lazy results only retain bytes for rows whose entities were actually kept.
   */
  finalize?(): void;
}

/** Wraps classic materialized POJO rows, i.e. from node-pg results or hand-built test rows. */
export class PojoRowData implements RowData {
  constructor(private rows: readonly any[]) {}

  get rowCount(): number {
    return this.rows.length;
  }

  get(rowIndex: number, columnName: string): any {
    return this.rows[rowIndex][columnName];
  }

  toRow(rowIndex: number): any {
    return this.rows[rowIndex];
  }

  toRows(): any[] {
    return this.rows as any[];
  }
}

/** A shared `RowData` for new entities, which have no database row yet (all columns undefined). */
export const emptyRowData: RowData = {
  rowCount: 0,
  get() {
    return undefined;
  },
  toRow() {
    // Matches the pre-RowData behavior of new entities having an empty `row` bag
    return {};
  },
  toRows() {
    return [];
  },
};

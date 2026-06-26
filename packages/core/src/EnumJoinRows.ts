import { Entity } from "./Entity";
import { getEmInternalApi } from "./EntityManager";
import { EntityMetadata, getBaseAndSelfMetas } from "./EntityMetadata";
import { EnumMetadata } from "./EnumMetadata";
import { JoinRowOperation } from "./JoinRows";
import { keyToTaggedId } from "./keys";
import { ReactionsManager } from "./ReactionsManager";
import { EnumJoinRowTodo } from "./Todo";
import { remove } from "./utils";

/**
 * A `ManyToManyLike` for enum-backed m2m relations, i.e. `Publisher.logoColors`.
 *
 * Unlike a true entity-to-entity m2m, the "other" side is an enum, so we track the enum's
 * numeric id (not an `Entity`) and there is no reverse field/percolation to keep in sync.
 */
export type EnumManyToManyLike = {
  entity: Entity;
  joinTableName: string;
  /** The entity's FK column, e.g. `publisher_id`. */
  columnName: string;
  /** The enum's FK column, e.g. `color_id`. */
  otherColumnName: string;
  fieldName: string;
  meta: EntityMetadata;
  enumDetailType: EnumMetadata<any, any, number>;
  /** Whether the join table has a surrogate `id` PK; if false the FK pair is the composite PK. */
  hasJoinTableId: boolean;
};

/**
 * A "pseudo-entity" for an enum-m2m join row, e.g. one `publisher_logo_colors` row.
 *
 * Mirrors {@link JoinRow}'s lifecycle (`op`/`persisted`/`deleted`), but the "other" side is the
 * enum's numeric id rather than a second `Entity`.
 */
export interface EnumJoinRow {
  op: JoinRowOperation;
  /** The surrogate key for id-ful join tables; always undefined for id-less tables. */
  id: number | undefined;
  /** Whether this row exists (or is assumed to exist) in the database; see {@link JoinRow}. */
  persisted: boolean;
  /** The owning entity, e.g. the `Publisher`. */
  entity: Entity;
  /** The enum's numeric id, e.g. `color.id`. */
  enumId: number;
  deleted?: boolean;
}

/** A small holder around enum-m2m join rows, modeled on {@link JoinRows}. */
export class EnumJoinRows {
  private readonly rows: EnumJoinRow[] = [];
  /** Index of `entity -> enumId -> row` so lookups don't scan `rows`. */
  private readonly index = new Map<Entity, Map<number, EnumJoinRow>>();

  constructor(
    readonly m2m: EnumManyToManyLike,
    private rm: ReactionsManager,
  ) {}

  /** Marks an `(entity, enumId)` row as added. */
  addNew(entity: Entity, enumId: number): void {
    const existing = this.#get(entity, enumId);
    if (existing) {
      existing.deleted = false;
      existing.op = JoinRowOperation.Pending;
    } else {
      const row: EnumJoinRow = { op: JoinRowOperation.Pending, id: undefined, persisted: false, entity, enumId };
      this.rows.push(row);
      this.#add(row);
    }
    this.#touch(entity);
  }

  /** Marks an `(entity, enumId)` row as removed. */
  addRemove(entity: Entity, enumId: number): void {
    const existing = this.#get(entity, enumId);
    if (existing) {
      if (!existing.persisted) {
        // It was only added in-memory and never persisted, so just drop it
        remove(this.rows, existing);
        this.index.get(entity)?.delete(enumId);
      } else {
        existing.deleted = true;
      }
      existing.op = JoinRowOperation.Pending;
    } else {
      // Removing against an unloaded collection, so assume the row exists and queue a delete.
      const row: EnumJoinRow = {
        op: JoinRowOperation.Pending,
        id: undefined,
        persisted: true,
        entity,
        enumId,
        deleted: true,
      };
      this.rows.push(row);
      this.#add(row);
    }
    this.#touch(entity);
  }

  /** Adds an existing (preloaded/loaded) row without marking it dirty. */
  addPreloadedRow(entity: Entity, id: number | undefined, enumId: number): void {
    if (!this.#get(entity, enumId)) {
      const row: EnumJoinRow = { op: JoinRowOperation.Pending, id, persisted: true, entity, enumId };
      this.rows.push(row);
      this.#add(row);
    }
  }

  /** Drops all in-memory rows for `entity`, e.g. when it is being deleted (the db cascades the rows). */
  removeAllFor(entity: Entity): void {
    const map = this.index.get(entity);
    if (!map) return;
    for (const row of map.values()) remove(this.rows, row);
    this.index.delete(entity);
  }

  /** Look up/create our internal rows for the db rows, marking any no-longer-present rows deleted. */
  async loadRows(entityIds: string[], dbRows: any[]): Promise<void> {
    const { em } = this.m2m.entity;
    const { columnName, otherColumnName, meta } = this.m2m;

    // Make sure the owning entities are in memory.
    const ids = dbRows.map((dbRow) => keyToTaggedId(meta, dbRow[columnName])!);
    await em.loadAll(meta.cstr, [...new Set(ids)]);

    // For em.refresh/reload, watch for persisted rows that are no longer in the db. Pending
    // (not-yet-persisted) in-memory adds are left alone.
    const existingRows = new Set<EnumJoinRow>();
    for (const id of entityIds) {
      const entity = em.getEntity(id);
      if (!entity) continue;
      const map = this.index.get(entity);
      if (map) for (const row of map.values()) if (row.persisted) existingRows.add(row);
    }

    for (const dbRow of dbRows) {
      const entity = em.getEntity(keyToTaggedId(meta, dbRow[columnName])!)!;
      const enumId = dbRow[otherColumnName] as number;
      let row = this.#get(entity, enumId);
      if (!row) {
        row = { op: JoinRowOperation.Completed, id: dbRow.id, persisted: true, entity, enumId };
        this.rows.push(row);
        this.#add(row);
      } else {
        row.id = dbRow.id;
        row.persisted = true;
        existingRows.delete(row);
      }
    }

    for (const row of existingRows) row.deleted = true;
  }

  /** Returns the current (non-deleted) enum ids for `entity`, sorted by enum id for a stable order. */
  getIds(entity: Entity): number[] {
    const map = this.index.get(entity);
    if (!map) return [];
    return Array.from(map.values())
      .filter((r) => !r.deleted)
      .map((r) => r.enumId)
      .sort((a, b) => a - b);
  }

  /** Returns the current (non-deleted) enum codes for `entity`. */
  getCodes(entity: Entity): any[] {
    return this.getIds(entity).map((id) => this.m2m.enumDetailType.findById(id)!.code);
  }

  /** Scans our `rows` for newly-added/newly-deleted rows that need `INSERT`s/`DELETE`s. */
  toTodo(): EnumJoinRowTodo | undefined {
    const newRows = this.rows.filter((r) => !r.persisted && r.deleted !== true && r.op === "pending");
    const deletedRows = this.rows.filter((r) => r.persisted && r.deleted === true && r.op === "pending");
    if (newRows.length === 0 && deletedRows.length === 0) return undefined;
    return {
      m2m: this.m2m,
      newRows,
      deletedRows,
      resetAfterFlushed: () => {
        for (const row of this.rows) {
          if (row.op === JoinRowOperation.Pending || row.op === JoinRowOperation.Flushed)
            row.op = JoinRowOperation.Completed;
        }
      },
    };
  }

  get hasChanges(): boolean {
    return this.rows.some(({ op }) => op === JoinRowOperation.Pending || op === JoinRowOperation.Flushed);
  }

  #get(entity: Entity, enumId: number): EnumJoinRow | undefined {
    return this.index.get(entity)?.get(enumId);
  }

  #add(row: EnumJoinRow): void {
    let map = this.index.get(row.entity);
    if (!map) {
      map = new Map();
      this.index.set(row.entity, map);
    }
    map.set(row.enumId, row);
  }

  #touch(entity: Entity): void {
    const { em } = entity;
    getEmInternalApi(em).isLoadedCache.resetIsLoaded(entity, this.m2m.fieldName);
    this.rm.queueDownstreamReactables(entity, this.m2m.fieldName);
    if (getBaseAndSelfMetas(entity).some((meta) => meta.config.__data.touchOnChange.has(this.m2m.fieldName))) {
      em.touch(entity);
    }
  }
}

import { Entity } from "./Entity";
import { getEmInternalApi } from "./EntityManager";
import { getBaseAndSelfMetas } from "./EntityMetadata";
import { ReactionsManager } from "./ReactionsManager";
import { JoinRowTodo } from "./Todo";
import { keyToTaggedId } from "./keys";
import { ManyToManyCollection } from "./relations/ManyToManyCollection";
import { remove } from "./utils";

/** A small holder around m2m join rows, which we treat as psuedo-entities. */
export class JoinRows {
  // The in-memory rows for our m2m table.
  private readonly rows: JoinRow[] = [];
  private readonly index: ManyToManyIndex;

  constructor(
    // This could be either side of the m2m relation, depending on which is accessed first.
    // Regardless of which m2m side, we still have a single `JoinRows` instance in memory per m2m table.
    readonly m2m: ManyToManyCollection<any, any>,
    private rm: ReactionsManager,
  ) {
    this.index = new ManyToManyIndex(m2m);
  }

  /** Adds a new join row to this table. */
  addNew(m2m: ManyToManyCollection<any, any>, e1: Entity, e2: Entity): void {
    if (!e1) throw new Error(`Cannot add a m2m row with an entity that is ${e1}`);
    if (!e2) throw new Error(`Cannot add a m2m row with an entity that is ${e2}`);
    const { em } = this.m2m.entity;
    const existing = this.index.get(m2m, e1, e2);
    if (existing) {
      existing.deleted = false;
      existing.op = JoinRowOperation.Pending;
    } else {
      const row = {
        op: JoinRowOperation.Pending,
        id: undefined,
        columns: { [m2m.columnName]: e1, [m2m.otherColumnName]: e2 },
      } satisfies JoinRow;
      this.rows.push(row);
      this.index.add(m2m, e1, e2, row);
    }
    getEmInternalApi(e1.em).isLoadedCache.resetIsLoaded(e1, m2m.fieldName);
    getEmInternalApi(e1.em).isLoadedCache.resetIsLoaded(e2, m2m.otherFieldName);
    this.rm.queueDownstreamReactiveFields(e1, m2m.fieldName);
    this.rm.queueDownstreamReactiveFields(e2, m2m.otherFieldName);
    if (getBaseAndSelfMetas(e1).some((meta) => meta.config.__data.touchOnChange.has(m2m.fieldName))) {
      em.touch(e1);
    }
    if (getBaseAndSelfMetas(e2).some((meta) => meta.config.__data.touchOnChange.has(m2m.otherFieldName))) {
      em.touch(e2);
    }
  }

  /** Adds a new remove to this table. */
  addRemove(m2m: ManyToManyCollection<any, any>, e1: Entity, e2: Entity): void {
    const { em } = this.m2m.entity;
    const existing = this.index.get(m2m, e1, e2);
    if (existing) {
      if (!existing.id) {
        remove(this.rows, existing);
        this.index.remove(existing);
      } else {
        existing.deleted = true;
      }
      existing.op = JoinRowOperation.Pending;
    } else {
      // Use -1 to force the sortJoinRows to notice us as dirty ("delete: true but id is set")
      const row = {
        op: JoinRowOperation.Pending,
        id: -1,
        columns: { [m2m.columnName]: e1, [m2m.otherColumnName]: e2 },
        deleted: true,
      } satisfies JoinRow;
      this.rows.push(row);
      this.index.add(m2m, e1, e2, row);
    }
    getEmInternalApi(e1.em).isLoadedCache.resetIsLoaded(e1, m2m.fieldName);
    getEmInternalApi(e1.em).isLoadedCache.resetIsLoaded(e2, m2m.otherFieldName);
    this.rm.queueDownstreamReactiveFields(e1, m2m.fieldName);
    this.rm.queueDownstreamReactiveFields(e2, m2m.otherFieldName);
    if (getBaseAndSelfMetas(e1).some((meta) => meta.config.__data.touchOnChange.has(m2m.fieldName))) {
      em.touch(e1);
    }
    if (getBaseAndSelfMetas(e2).some((meta) => meta.config.__data.touchOnChange.has(m2m.otherFieldName))) {
      em.touch(e2);
    }
  }

  /** Return any "old values" for a m2m collection that might need reactivity checks. */
  removedFor(m2m: ManyToManyCollection<any, any>, e1: Entity): Entity[] {
    const { columnName, otherColumnName } = m2m;
    // I.e. if we did `t1.books.remove(b1)` find all join rows that have
    // `tag_id=t1`, are marked for deletion, and then `.map` them to the removed book.
    const removedRows = this.index.getOthers(m2m.columnName, e1).filter((r) => r.deleted);
    return removedRows.map((r) => r.columns[otherColumnName]);
  }

  addedFor(m2m: ManyToManyCollection<any, any>, e1: Entity): Entity[] {
    const { columnName, otherColumnName } = m2m;
    const addedRows = this.index
      .getOthers(m2m.columnName, e1)
      .filter((r) => r.id === undefined && r.deleted !== true && r.op === JoinRowOperation.Pending);
    return addedRows.map((r) => r.columns[otherColumnName]);
  }

  /** Adds an existing join row to this table. */
  addPreloadedRow(m2m: ManyToManyCollection<any, any>, id: number, e1: Entity, e2: Entity): void {
    const existing = this.index.get(m2m, e1, e2);
    if (existing) {
      // Treat any existing WIP change as source-of-truth, so leave it alone
    } else {
      const row = {
        op: JoinRowOperation.Pending,
        id,
        columns: { [m2m.columnName]: e1, [m2m.otherColumnName]: e2 },
      } satisfies JoinRow;
      this.rows.push(row);
      this.index.add(m2m, e1, e2, row);
    }
  }

  /** Look up/create our internal JoinRow psuedo-entities for the db rows. */
  async loadRows(tuples: [string, string][], dbRows: any[]): Promise<void> {
    const { em } = this.m2m.entity;
    const { columnName: column1, otherColumnName: column2 } = this.m2m;
    const { meta: meta1, otherMeta: meta2 } = this.m2m;

    const oneIds = [];
    const twoIds = [];
    for (const dbRow of dbRows) {
      oneIds.push(keyToTaggedId(meta1, dbRow[column1]));
      twoIds.push(keyToTaggedId(meta2, dbRow[column2]));
    }

    // Make sure we have entities in memory for all the joined-to tables
    await Promise.all([em.loadAll(meta1.cstr, oneIds), em.loadAll(meta2.cstr, twoIds)]);

    // If we're doing a em.refresh/reload, we need to watch for rows that are no longer here
    const existingRows = new Set<JoinRow>();
    for (const [columnName, id] of tuples) {
      const others = this.index.getOthers(columnName, em.getEntity(id)!);
      for (const row of others) existingRows.add(row);
    }

    let i = 0;
    for (const dbRow of dbRows) {
      const e1 = em.getEntity(oneIds[i])!;
      const e2 = em.getEntity(twoIds[i++])!;
      let row = this.index.get(this.m2m, e1, e2);
      if (!row) {
        row = {
          op: JoinRowOperation.Completed,
          id: dbRow.id,
          columns: { [column1]: e1, [column2]: e2 },
          created_at: dbRow.created_at,
        };
        this.rows.push(row);
        this.index.add(this.m2m, e1, e2, row);
      } else {
        // If a placeholder row was created while a ManyToManyCollection was unloaded, and we find it during
        // a subsequent load/query, update its id to be what is in the database.
        row.id = dbRow.id;
        // Mark this row as still valid
        existingRows.delete(row);
      }
    }

    // Mark all no-longer-there rows as deleted
    existingRows.forEach((row) => {
      row.deleted = true;
    });
  }

  getOthers(columnName: string, entity: Entity): Entity[] {
    const others = this.index.getOthers(columnName, entity);
    if (others.length === 0) return [];
    const [c1, c2] = Object.keys(others[0].columns);
    const c = others[0].columns[c1] === entity ? c2 : c1;
    return others.filter((o) => !o.deleted).map((row) => row.columns[c]);
  }

  /** Scans our `rows` for newly-added/newly-deleted rows that need `INSERT`s/`UPDATE`s. */
  toTodo(): JoinRowTodo | undefined {
    const newRows = this.rows.filter((r) => r.id === undefined && r.deleted !== true && r.op === "pending");
    const deletedRows = this.rows.filter((r) => r.id !== undefined && r.deleted === true && r.op === "pending");
    if (newRows.length === 0 && deletedRows.length === 0) {
      return undefined;
    }
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

  get hasChanges() {
    return this.rows.some(({ op }) => op === JoinRowOperation.Pending || op === JoinRowOperation.Flushed);
  }
}

/**
 * A "psuedo-entity" for a join row.
 *
 * We treat this as a special entity, i.e. it has a primary key, `id`, two "relations" to each
 * entity for the current row, and an optional `created_at` column.
 *
 * These rows are immutable, i.e. once created we don't change either FK, and instead make
 * collection changes only by inserting new rows and deleting old rows.
 *
 * This makes the column1+column2 combination a composite key.
 */
export interface JoinRow {
  /**
   * Whether our relation has been processed or not.
   *
   * - `pending` means we've not flushed it to the Database
   * - `flushed` means we've flushed but `em.flush` hasn't fully completed yet, likely due to ReactiveQueryField calcs
   * - `completed` means we've been flushed and `em.flush` has completed
   */
  op: JoinRowOperation;
  id: number | undefined;
  columns: Record<string, Entity>;
  created_at?: Date;
  deleted?: boolean;
}

/** An enum to track our insert/delete state progression. */
export enum JoinRowOperation {
  Pending = "pending",
  Flushed = "flushed",
  Completed = "completed",
}

/** Keep an in-memory index to avoid sequentially scanning `rows`. */
class ManyToManyIndex {
  private indexes: Record<string, Map<Entity, Map<Entity, JoinRow>>> = {};

  constructor(m2m: ManyToManyCollection<any, any>) {
    this.indexes[m2m.columnName] = new Map();
    this.indexes[m2m.otherColumnName] = new Map();
  }

  add(m2m: ManyToManyCollection<any, any>, e1: Entity, e2: Entity, value: JoinRow): void {
    // Store both e1+e2 => value and e2+e1 => value so we can do lookups from either side
    this.#doAdd(this.indexes[m2m.columnName], e1, e2, value);
    this.#doAdd(this.indexes[m2m.otherColumnName], e2, e1, value);
  }

  remove(value: JoinRow): void {
    const [[column1, e1], [column2, e2]] = Object.entries(value.columns);
    this.#doRemove(this.indexes[column1], e1, e2);
    this.#doRemove(this.indexes[column2], e2, e1);
  }

  get(m2m: ManyToManyCollection<any, any>, e1: Entity, e2: Entity): JoinRow | undefined {
    return this.indexes[m2m.columnName].get(e1)?.get(e2);
  }

  /** Cheat and use the index to return "the other entities" for `entity`. */
  getOthers(columnName: string, entity: Entity): JoinRow[] {
    // It's empty m2m collection won't have any other entities, and so no index entries
    const map = this.indexes[columnName].get(entity);
    return map ? Array.from(map.values()) : [];
  }

  #doAdd(index: Map<Entity, Map<Entity, JoinRow>>, e1: Entity, e2: Entity, value: JoinRow): void {
    const map = index.get(e1) ?? new Map();
    if (map.size === 0) index.set(e1, map);
    map.set(e2, value);
  }

  #doRemove(index: Map<Entity, Map<Entity, JoinRow>>, e1: Entity, e2: Entity): void {
    index.get(e1)?.delete(e2);
  }
}

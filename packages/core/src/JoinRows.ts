import { Entity } from "./Entity";
import { getEmInternalApi } from "./EntityManager";
import { EntityMetadata, getBaseAndSelfMetas } from "./EntityMetadata";
import { EnumMetadata } from "./EnumMetadata";
import { ReactionsManager } from "./ReactionsManager";
import { JoinRowTodo } from "./Todo";
import { keyToNumber, keyToTaggedId } from "./keys";
import { remove } from "./utils";

/**
 * A simplified interface for ManyToManyCollection-like relations.
 *
 * Specifically lets ReactiveManyToMany & ReactiveManyToManyOtherSide use JoinRows
 * as if they were full-fledged m2m relations.
 *
 * The "other" side of the join table is usually a second entity, but for `EnumCollection`s
 * (i.e. `Publisher.logoColors`) it is an enum table; in that case `otherEnum` is set and the
 * other column's value is the enum's numeric id rather than an `Entity` (there is also no
 * `otherMeta`/`otherFieldName`, since enums have no reverse collection to keep in sync).
 */
export type ManyToManyLike = {
  entity: Entity;
  joinTableName: string;
  columnName: string;
  otherColumnName: string;
  fieldName: string;
  meta: EntityMetadata;
  /** Undefined when the other side is an enum. */
  otherFieldName?: string;
  /** Undefined when the other side is an enum. */
  otherMeta?: EntityMetadata;
  /** Set when the other side is an enum table, for mapping enum codes <-> their numeric ids. */
  otherEnum?: EnumMetadata<any, any, number>;
  /** Whether the join table has a surrogate `id` PK; if false the FK pair is the composite PK. */
  hasJoinTableId: boolean;
};

/** The value of a join row's column: an `Entity`, or an enum's numeric id for `EnumCollection`s. */
export type JoinColumnValue = Entity | number;

/** Whether a join column points at a not-yet-inserted entity (enum ids are never "new"). */
function isNewColumn(value: JoinColumnValue): boolean {
  return typeof value !== "number" && value.isNewEntity;
}

/** A small holder around m2m join rows, which we treat as psuedo-entities. */
export class JoinRows {
  // The in-memory rows for our m2m table.
  private readonly rows: JoinRow[] = [];
  private readonly index: ManyToManyIndex;

  constructor(
    // This could be either side of the m2m relation, depending on which is accessed first.
    // Regardless of which m2m side, we still have a single `JoinRows` instance in memory per m2m table.
    readonly m2m: ManyToManyLike,
    private rm: ReactionsManager,
  ) {
    this.index = new ManyToManyIndex(m2m);
  }

  /** Adds a new join row to this table. */
  addNew(m2m: ManyToManyLike, e1: Entity, e2: JoinColumnValue): void {
    if (!e1) throw new Error(`Cannot add a m2m row with an entity that is ${e1}`);
    if (!e2) throw new Error(`Cannot add a m2m row with an entity that is ${e2}`);
    const existing = this.index.get(m2m, e1, e2);
    if (existing) {
      existing.deleted = false;
      existing.op = JoinRowOperation.Pending;
    } else {
      const row = {
        op: JoinRowOperation.Pending,
        id: undefined,
        persisted: false,
        columns: { [m2m.columnName]: e1, [m2m.otherColumnName]: e2 },
      } satisfies JoinRow;
      this.rows.push(row);
      this.index.add(m2m, e1, e2, row);
    }
    this.#reactToChange(m2m, e1, e2);
  }

  /** Adds a new remove to this table. */
  addRemove(m2m: ManyToManyLike, e1: Entity, e2: JoinColumnValue): void {
    const existing = this.index.get(m2m, e1, e2);
    if (existing) {
      if (!existing.persisted) {
        // It was only added in-memory and never persisted, so just drop it
        remove(this.rows, existing);
        this.index.remove(existing);
      } else {
        existing.deleted = true;
      }
      existing.op = JoinRowOperation.Pending;
    } else {
      // We're removing against an unloaded collection, so assume the row exists in the database
      // (persisted: true) and queue a delete; the delete keys off the (col1, col2) composite.
      const row = {
        op: JoinRowOperation.Pending,
        id: undefined,
        persisted: true,
        columns: { [m2m.columnName]: e1, [m2m.otherColumnName]: e2 },
        deleted: true,
      } satisfies JoinRow;
      this.rows.push(row);
      this.index.add(m2m, e1, e2, row);
    }
    this.#reactToChange(m2m, e1, e2);
  }

  /** Return any "old values" for a m2m collection that might need reactivity checks. */
  removedFor(m2m: ManyToManyLike, e1: Entity): JoinColumnValue[] {
    const { otherColumnName } = m2m;
    // I.e. if we did `t1.books.remove(b1)` find all join rows that have
    // `tag_id=t1`, are marked for deletion, and then `.map` them to the removed book.
    const removedRows = this.index.getOthers(m2m.columnName, e1).filter((r) => r.deleted);
    return removedRows.map((r) => r.columns[otherColumnName]);
  }

  addedFor(m2m: ManyToManyLike, e1: Entity): JoinColumnValue[] {
    const { otherColumnName } = m2m;
    const addedRows = this.index
      .getOthers(m2m.columnName, e1)
      .filter(
        (r) =>
          ((!r.persisted && r.op === JoinRowOperation.Pending) || r.op === JoinRowOperation.Flushed) &&
          r.deleted !== true,
      );
    return addedRows.map((r) => r.columns[otherColumnName]);
  }

  /** Adds an existing join row to this table. */
  addPreloadedRow(m2m: ManyToManyLike, id: number | undefined, e1: Entity, e2: JoinColumnValue): void {
    const existing = this.index.get(m2m, e1, e2);
    if (existing) {
      // Treat any existing WIP change as source-of-truth, so leave it alone
    } else {
      const row = {
        op: JoinRowOperation.Pending,
        id,
        persisted: true,
        columns: { [m2m.columnName]: e1, [m2m.otherColumnName]: e2 },
      } satisfies JoinRow;
      this.rows.push(row);
      this.index.add(m2m, e1, e2, row);
    }
  }

  /** Look up/create our internal JoinRow psuedo-entities for the db rows. */
  async loadRows(tuples: [string, string][], dbRows: any[]): Promise<void> {
    const { em } = this.m2m.entity;
    const { columnName: column1, otherColumnName: column2, meta: meta1, otherMeta: meta2, otherEnum } = this.m2m;

    const oneIds: string[] = [];
    // Tagged ids for an entity other-side, or raw enum ids for an enum other-side.
    const twoVals: JoinColumnValue[] = [];
    for (const dbRow of dbRows) {
      oneIds.push(keyToTaggedId(meta1, dbRow[column1])!);
      twoVals.push(
        otherEnum ? (dbRow[column2] as number) : (em.getEntity(keyToTaggedId(meta2!, dbRow[column2])!) as any),
      );
    }

    // Make sure we have entities in memory for all the joined-to tables. The enum side has no
    // entities to load; the entity sides do (and `twoVals` is re-resolved to entities below).
    await Promise.all([
      em.loadAll(meta1.cstr, oneIds),
      otherEnum
        ? Promise.resolve([])
        : em.loadAll(
            meta2!.cstr,
            dbRows.map((dbRow) => keyToTaggedId(meta2!, dbRow[column2])!),
          ),
    ]);

    // If we're doing a em.refresh/reload, we need to watch for rows that are no longer here. For an
    // enum other-side, only persisted rows are delete-candidates (pending in-memory adds are kept,
    // since `EnumCollection` relies on `JoinRows` to hold them rather than re-asserting on load).
    const existingRows = new Set<JoinRow>();
    for (const [columnName, id] of tuples) {
      const others = this.index.getOthers(columnName, em.getEntity(id)!);
      for (const row of others) if (!otherEnum || row.persisted) existingRows.add(row);
    }

    let i = 0;
    for (const dbRow of dbRows) {
      const e1 = em.getEntity(oneIds[i])!;
      const e2 = otherEnum ? (dbRow[column2] as number) : em.getEntity(keyToTaggedId(meta2!, dbRow[column2])!)!;
      i++;
      let row = this.index.get(this.m2m, e1, e2);
      if (!row) {
        row = {
          op: JoinRowOperation.Completed,
          id: dbRow.id,
          persisted: true,
          columns: { [column1]: e1, [column2]: e2 },
          created_at: dbRow.created_at,
        };
        this.rows.push(row);
        this.index.add(this.m2m, e1, e2, row);
      } else {
        // If a placeholder row was created while a ManyToManyCollection was unloaded, and we find it during
        // a subsequent load/query, update its id to be what is in the database and mark it persisted.
        row.id = dbRow.id;
        row.persisted = true;
        // Mark this row as still valid
        existingRows.delete(row);
      }
    }

    // Mark all no-longer-there rows as deleted
    for (const row of existingRows) row.deleted = true;
  }

  getOthers(columnName: string, entity: Entity): JoinColumnValue[] {
    const others = this.index.getOthers(columnName, entity);
    if (others.length === 0) return [];
    const [c1, c2] = Object.keys(others[0].columns);
    const c = others[0].columns[c1] === entity ? c2 : c1;
    return others.filter((o) => !o.deleted).map((row) => row.columns[c]);
  }

  /** Drops all in-memory rows where `entity` is on `columnName`, e.g. when it is being deleted. */
  removeAllFor(columnName: string, entity: Entity): void {
    for (const row of this.index.getOthers(columnName, entity)) {
      remove(this.rows, row);
      this.index.remove(row);
    }
  }

  /** Scans our `rows` for newly-added/newly-deleted rows that need `INSERT`s/`UPDATE`s. */
  toTodo(): JoinRowTodo | undefined {
    const newRows = this.rows.filter((r) => !r.persisted && r.deleted !== true && r.op === "pending");
    const deletedRows = this.rows.filter((r) => r.persisted && r.deleted === true && r.op === "pending");
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
      // The driver flushes pure (int, int) FK pairs; resolve them here so it never has to know
      // whether a column points at an entity (use its id) or an enum (its value is already the id).
      dbValue: (row, columnName) => this.#dbValue(row, columnName),
      isNew: (row, columnName) => isNewColumn(row.columns[columnName]),
    };
  }

  get hasChanges() {
    return this.rows.some(({ op }) => op === JoinRowOperation.Pending || op === JoinRowOperation.Flushed);
  }

  /** The db int value for `row`'s `columnName`: an entity's id, or (for enums) the enum's id itself. */
  #dbValue(row: JoinRow, columnName: string): number {
    const value = row.columns[columnName];
    if (typeof value === "number") return value;
    const meta = columnName === this.m2m.columnName ? this.m2m.meta : this.m2m.otherMeta!;
    return keyToNumber(meta, value.idTagged)!;
  }

  /**
   * Invalidates caches & queues reactivity for a join-row change.
   *
   * The owning entity (`e1`) always reacts; the "other" side only reacts when it is an entity,
   * since enum other-sides have no `em`/reverse-field to keep in sync.
   */
  #reactToChange(m2m: ManyToManyLike, e1: Entity, e2: JoinColumnValue): void {
    const { em } = this.m2m.entity;
    const api = getEmInternalApi(e1.em);
    api.isLoadedCache.resetIsLoaded(e1, m2m.fieldName);
    this.rm.queueDownstreamReactables(e1, m2m.fieldName);
    if (getBaseAndSelfMetas(e1).some((meta) => meta.config.__data.touchOnChange.has(m2m.fieldName))) {
      em.touch(e1);
    }
    if (!m2m.otherEnum) {
      const other = e2 as Entity;
      const otherFieldName = m2m.otherFieldName!;
      api.isLoadedCache.resetIsLoaded(other, otherFieldName);
      this.rm.queueDownstreamReactables(other, otherFieldName);
      if (getBaseAndSelfMetas(other).some((meta) => meta.config.__data.touchOnChange.has(otherFieldName))) {
        em.touch(other);
      }
    }
  }
}

/**
 * A "psuedo-entity" for a join row.
 *
 * We treat this as a special entity, i.e. it has two "relations" to each entity for the current
 * row, an optional surrogate `id` primary key, and an optional `created_at` column.
 *
 * These rows are immutable, i.e. once created we don't change either FK, and instead make
 * collection changes only by inserting new rows and deleting old rows.
 *
 * This makes the column1+column2 combination a composite key. For id-less join tables, that
 * composite is the actual primary key and `id` is always undefined.
 */
export interface JoinRow {
  /**
   * Whether our relation has been processed or not.
   *
   * - `pending` means we've not flushed it to the Database
   * - `flushed` means we've flushed but `em.flush` hasn't fully completed yet, likely due to AsyncReactiveField calcs
   * - `completed` means we've been flushed and `em.flush` has completed
   */
  op: JoinRowOperation;
  /** The surrogate key for id-ful join tables; always undefined for id-less tables. */
  id: number | undefined;
  /**
   * Whether this row exists (or is assumed to exist) in the database.
   *
   * This is orthogonal to `op` (the flush lifecycle) and is what distinguishes a pending insert
   * from a pending delete: a `pending` row that is `!persisted` is a pending INSERT (added in
   * memory, not yet in the db), while a `pending` row that is `persisted` is a pending DELETE
   * (in the db, marked `deleted`). `op` alone cannot tell these apart, because both inserts and
   * deletes walk the same `pending -> flushed -> completed` progression.
   *
   * We track this as its own flag rather than inferring it from `id` being set/unset, because
   * id-less join tables (whose PK is just the composite of the two FKs) never have an `id` — so
   * `id === undefined` would be ambiguous. `persisted` is the id-agnostic generalization of the
   * `id`-is-set check that id-ful tables historically relied on.
   *
   * It must survive add/remove/re-add sequences: e.g. loading a row (persisted), removing it
   * (pending delete), then re-adding it (`deleted` flipped back to false, `op` back to `pending`)
   * leaves a `pending && !deleted` row that looks identical to a fresh insert — but it is still in
   * the db, so a subsequent remove must issue a DELETE, which only `persisted` can tell us.
   */
  persisted: boolean;
  /** Maps each FK column to its value: an `Entity`, or (for `EnumCollection`s) an enum's numeric id. */
  columns: Record<string, JoinColumnValue>;
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
  private indexes: Record<string, Map<JoinColumnValue, Map<JoinColumnValue, JoinRow>>> = {};

  constructor(private readonly m2m: ManyToManyLike) {
    this.indexes[m2m.columnName] = new Map();
    this.indexes[m2m.otherColumnName] = new Map();
  }

  add(m2m: ManyToManyLike, e1: JoinColumnValue, e2: JoinColumnValue, value: JoinRow): void {
    // Store both e1+e2 => value and e2+e1 => value so we can do lookups from either side
    this.#doAdd(this.indexes[m2m.columnName], e1, e2, value);
    this.#doAdd(this.indexes[m2m.otherColumnName], e2, e1, value);
  }

  remove(value: JoinRow): void {
    const [[column1, e1], [column2, e2]] = Object.entries(value.columns);
    this.#doRemove(this.indexes[column1], e1, e2);
    this.#doRemove(this.indexes[column2], e2, e1);
  }

  get(m2m: ManyToManyLike, e1: JoinColumnValue, e2: JoinColumnValue): JoinRow | undefined {
    return this.indexes[m2m.columnName].get(e1)?.get(e2);
  }

  /** Cheat and use the index to return "the other entities" for `entity`. */
  getOthers(columnName: string, entity: JoinColumnValue): JoinRow[] {
    // It's empty m2m collection won't have any other entities, and so no index entries
    const map = this.indexes[columnName].get(entity);
    if (!map) return [];
    // Sort for a stable order regardless of how many batches contributed rows — the underlying
    // Map preserves insertion order, which depends on DataLoader timing and is non-deterministic
    // across processes. New rows (no key yet) sort last.
    const rows = Array.from(map.values());
    if (this.m2m.hasJoinTableId) {
      // Sort by join-row id.
      return rows.sort((a, b) => (a.id ?? Infinity) - (b.id ?? Infinity));
    }
    // Id-less tables have no surrogate id, so sort by the other side's id.
    const otherColumn = columnName === this.m2m.columnName ? this.m2m.otherColumnName : this.m2m.columnName;
    if (this.m2m.otherEnum && otherColumn === this.m2m.otherColumnName) {
      // The other side is an enum, so its column value is already its numeric id.
      return rows.sort((a, b) => (a.columns[otherColumn] as number) - (b.columns[otherColumn] as number));
    }
    const otherMeta = columnName === this.m2m.columnName ? this.m2m.otherMeta! : this.m2m.meta;
    const key = (r: JoinRow) => {
      const other = r.columns[otherColumn] as Entity;
      return other.isNewEntity ? Infinity : keyToNumber(otherMeta, other.id)!;
    };
    return rows.sort((a, b) => key(a) - key(b));
  }

  #doAdd(
    index: Map<JoinColumnValue, Map<JoinColumnValue, JoinRow>>,
    e1: JoinColumnValue,
    e2: JoinColumnValue,
    value: JoinRow,
  ): void {
    const map = index.get(e1) ?? new Map();
    if (map.size === 0) index.set(e1, map);
    map.set(e2, value);
  }

  #doRemove(
    index: Map<JoinColumnValue, Map<JoinColumnValue, JoinRow>>,
    e1: JoinColumnValue,
    e2: JoinColumnValue,
  ): void {
    index.get(e1)?.delete(e2);
  }
}

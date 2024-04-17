import { Entity } from "./Entity";
import { getMetadata } from "./EntityMetadata";
import { ReactionsManager } from "./ReactionsManager";
import { JoinRowTodo } from "./Todo";
import { keyToTaggedId } from "./keys";
import { ManyToManyCollection } from "./relations/ManyToManyCollection";
import { remove } from "./utils";

/** A small holder around m2m join rows, which we treat as psuedo-entities. */
export class JoinRows {
  // The in-memory rows for our m2m table.
  private readonly rows: JoinRow[] = [];

  constructor(
    readonly m2m: ManyToManyCollection<any, any>,
    private rm: ReactionsManager,
  ) {}

  /** Adds a new join row to this table. */
  addNew(m2m: ManyToManyCollection<any, any>, e1: Entity, e2: Entity): void {
    if (!e1) throw new Error(`Cannot add a m2m row with an entity that is ${e1}`);
    if (!e2) throw new Error(`Cannot add a m2m row with an entity that is ${e2}`);
    const { columnName, otherColumnName } = m2m;
    const { em } = this.m2m.entity;
    const existing = this.rows.find((r) => r[columnName] === e1 && r[otherColumnName] === e2);
    if (existing) {
      existing.deleted = false;
    } else {
      const joinRow: JoinRow = { id: undefined, [m2m.columnName]: e1, [m2m.otherColumnName]: e2 };
      this.rows.push(joinRow);
    }
    this.rm.queueDownstreamReactiveFields(e1, m2m.fieldName);
    this.rm.queueDownstreamReactiveFields(e2, m2m.otherFieldName);
    if (getMetadata(e1).config.__data.touchOnChange.has(m2m.fieldName)) {
      em.touch(e1);
    }
    if (getMetadata(e2).config.__data.touchOnChange.has(m2m.otherFieldName)) {
      em.touch(e2);
    }
  }

  /** Adds a new remove to this table. */
  addRemove(m2m: ManyToManyCollection<any, any>, e1: Entity, e2: Entity): void {
    const { columnName, otherColumnName } = m2m;
    const { em } = this.m2m.entity;
    const existing = this.rows.find((r) => r[columnName] === e1 && r[otherColumnName] === e2);
    if (existing) {
      if (!existing.id) {
        remove(this.rows, existing);
      } else {
        existing.deleted = true;
      }
    } else {
      // Use -1 to force the sortJoinRows to notice us as dirty ("delete: true but id is set")
      this.rows.push({ id: -1, [columnName]: e1, [otherColumnName]: e2, deleted: true });
    }
    this.rm.queueDownstreamReactiveFields(e1, m2m.fieldName);
    this.rm.queueDownstreamReactiveFields(e2, m2m.otherFieldName);
    if (getMetadata(e1).config.__data.touchOnChange.has(m2m.fieldName)) {
      em.touch(e1);
    }
    if (getMetadata(e2).config.__data.touchOnChange.has(m2m.otherFieldName)) {
      em.touch(e2);
    }
  }

  /** Return any "old values" for a m2m collection that might need reactivity checks. */
  removedFor(m2m: ManyToManyCollection<any, any>, e1: Entity): Entity[] {
    const { columnName, otherColumnName } = m2m;
    // I.e. if we did `t1.books.remove(b1)` find all join rows that have
    // `tag_id=t1`, are marked for deletion, and then `.map` them to the removed book.
    const rows = this.rows.filter((r) => r[columnName] === e1 && r.deleted);
    return rows.map((r) => r[otherColumnName] as Entity);
  }

  /** Adds an existing join row to this table. */
  addExisting(m2m: ManyToManyCollection<any, any>, id: number, e1: Entity, e2: Entity): void {
    const { columnName, otherColumnName } = m2m;
    const existing = this.rows.find((r) => r[columnName] === e1 && r[otherColumnName] === e2);
    if (existing) {
      // Treat any existing WIP change as source-of-truth, so leave it alone
    } else {
      const joinRow: JoinRow = { id, [m2m.columnName]: e1, [m2m.otherColumnName]: e2 };
      this.rows.push(joinRow);
    }
  }

  /**
   * Look up/create our JoinRow psuedo-entity for the given db row.
   *
   * This is a promise b/c we'll `em.load` both sides of the join row. We could potentially avoid
   * this if our m2m load returned entities in the result set, then we could `em.hydrate` instead.
   */
  async findForRow(dbRow: any): Promise<JoinRow> {
    const { em } = this.m2m.entity;
    const { columnName: column1, otherColumnName: column2 } = this.m2m;
    const { meta: meta1, otherMeta: meta2 } = this.m2m;
    let row = this.rows.find((jr) => {
      return (
        // Use idMaybe because row join might be for a not-yet-flushed new entity
        (jr[column1] as Entity).idMaybe === keyToTaggedId(meta1, dbRow[column1]) &&
        (jr[column2] as Entity).idMaybe === keyToTaggedId(meta2, dbRow[column2])
      );
    });
    if (!row) {
      // For this join table row, load the entities of both foreign keys. Because we are `EntityManager.load`,
      // this is N+1 safe (and will check the Unit of Work for already-loaded entities), but per ^ comment
      // we chould pull these from the row itself if we did a fancier join.
      const p1 = em.load(meta1.cstr, keyToTaggedId(meta1, dbRow[column1])!);
      const p2 = em.load(meta2.cstr, keyToTaggedId(meta2, dbRow[column2])!);
      const [e1, e2] = await Promise.all([p1, p2]);
      row = { id: dbRow.id, m2m: this.m2m, [column1]: e1, [column2]: e2, created_at: dbRow.created_at };
      this.rows.push(row);
    } else {
      // If a placeholder row was created while a ManyToManyCollection was unloaded, and we find it during
      // a subsequent load/query, update its id to be what is in the database.
      row.id = dbRow.id;
    }
    return row;
  }

  /** Scans our `rows` for newly-added/newly-deleted rows that need `INSERT`s/`UPDATE`s. */
  toTodo(): JoinRowTodo | undefined {
    const newRows = this.rows.filter((r) => r.id === undefined && r.deleted !== true);
    const deletedRows = this.rows.filter((r) => r.id !== undefined && r.deleted === true);
    if (newRows.length === 0 && deletedRows.length === 0) {
      return undefined;
    }
    return { m2m: this.m2m, newRows, deletedRows };
  }

  get hasChanges() {
    const todos = this.toTodo();
    return !!todos;
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
  id: number | undefined;
  // The two columns; unfortunately the TS index signature requires unioning all possible types
  [column: string]: number | Entity | undefined | boolean | Date;
  created_at?: Date;
  deleted?: boolean;
}

import { Entity } from "./Entity";
import { keyToString } from "./keys";
import { ManyToManyCollection } from "./relations/ManyToManyCollection";

/** A small holder around m2m join rows, which we treat as psuedo-entities. */
export class JoinRows {
  // The in-memory rows for our m2m table.
  readonly rows: JoinRow[] = [];

  constructor(readonly m2m: ManyToManyCollection<any, any>) {}

  /**
   * Adds a new join row to this table.
   *
   * Note that we might encode a "delete" w/o knowing the id.
   */
  addNew(joinRow: JoinRow): void {
    this.rows.push(joinRow);
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
        (jr[column1] as Entity).id === keyToString(meta1, dbRow[column1]) &&
        (jr[column2] as Entity).id === keyToString(meta2, dbRow[column2])
      );
    });
    if (!row) {
      // For this join table row, load the entities of both foreign keys. Because we are `EntityManager.load`,
      // this is N+1 safe (and will check the Unit of Work for already-loaded entities), but per ^ comment
      // we chould pull these from the row itself if we did a fancier join.
      const p1 = em.load(meta1.cstr, keyToString(meta1, dbRow[column1])!);
      const p2 = em.load(meta2.cstr, keyToString(meta2, dbRow[column2])!);
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
}

/**
 * A "psuedo-entity" for a join row.
 *
 * We treat this as a special entity, i.e. it has a primary key, `id`, two "relations" to each
 * entity for the current row, and an optional `created_at` column.
 */
export interface JoinRow {
  id: number | undefined;
  // The two columns; unfortunately the TS index signature requires unioning all possible types
  [column: string]: number | Entity | undefined | boolean | Date | ManyToManyCollection<any, any>;
  created_at?: Date;
  deleted?: boolean;
}

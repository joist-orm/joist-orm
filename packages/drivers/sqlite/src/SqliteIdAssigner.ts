import type Database from "better-sqlite3";
import { getInstanceData, IdAssigner, keyToTaggedId, Todo } from "joist-core";

/**
 * Reserves IDs from SQLite's built-in `sqlite_sequence` table used by AUTOINCREMENT columns.
 *
 * Tables must use `id INTEGER PRIMARY KEY AUTOINCREMENT` for this to work. SQLite
 * automatically maintains `sqlite_sequence` with the high-water mark for each such table.
 *
 * This assigner atomically bumps the `seq` value for all tables needing new IDs in a
 * single UPDATE...RETURNING query, then assigns the reserved range to new entities.
 */
export class SqliteAutoIncrementIdAssigner implements IdAssigner {
  #db: Database.Database;

  constructor(db: Database.Database) {
    this.#db = db;
  }

  async assignNewIds(todos: Record<string, Todo>): Promise<void> {
    // Collect tables that need IDs and their counts
    const needed: { todo: Todo; needsIds: any[]; tableName: string }[] = [];
    for (const todo of Object.values(todos)) {
      const needsIds = todo.inserts.filter((e) => e.idMaybe === undefined);
      if (needsIds.length > 0) {
        needed.push({ todo, needsIds, tableName: todo.metadata.tableName });
      }
    }
    if (needed.length === 0) return;

    // Ensure all tables have a sqlite_sequence entry (they might not if no rows have been inserted yet)
    const insertPlaceholders = needed.map(() => "(?, 0)").join(", ");
    const insertBindings = needed.map((n) => n.tableName);
    this.#db.prepare(`INSERT OR IGNORE INTO sqlite_sequence (name, seq) VALUES ${insertPlaceholders}`).run(
      ...insertBindings,
    );

    // Build a single UPDATE...RETURNING to reserve all ID ranges at once
    // SET seq = CASE name WHEN 'authors' THEN seq + 3 WHEN 'books' THEN seq + 5 END
    const setCases = needed.map(() => `WHEN ? THEN seq + ?`).join(" ");
    const returnCases = needed.map(() => `WHEN ? THEN ?`).join(" ");
    const names = needed.map(() => "?").join(", ");

    const sql = `
      UPDATE sqlite_sequence
      SET seq = CASE name ${setCases} END
      WHERE name IN (${names})
      RETURNING name, seq - CASE name ${returnCases} END as start_id
    `;

    const bindings: (string | number)[] = [];
    // SET cases: tableName, count pairs
    for (const n of needed) {
      bindings.push(n.tableName, n.needsIds.length);
    }
    // WHERE IN: table names
    for (const n of needed) {
      bindings.push(n.tableName);
    }
    // RETURNING cases: tableName, count pairs
    for (const n of needed) {
      bindings.push(n.tableName, n.needsIds.length);
    }

    const results = this.#db.prepare(sql).all(...bindings) as { name: string; start_id: number }[];

    // Build a lookup from table name to start_id
    const startIds = new Map(results.map((r) => [r.name, r.start_id]));

    // Assign the reserved IDs
    for (const { todo, needsIds, tableName } of needed) {
      const startId = startIds.get(tableName);
      if (startId === undefined) {
        throw new Error(`Failed to reserve IDs for table ${tableName}`);
      }
      for (let i = 0; i < needsIds.length; i++) {
        getInstanceData(needsIds[i]).data["id"] = keyToTaggedId(todo.metadata, startId + 1 + i);
      }
    }
  }
}

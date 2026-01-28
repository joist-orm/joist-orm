import type Database from "better-sqlite3";
import { getInstanceData, IdAssigner, keyToTaggedId, Todo } from "joist-core";

/**
 * Assigns IDs for new entities using SQLite's autoincrement via a sequence simulation table.
 *
 * This creates a `_joist_sequences` table that tracks the next ID for each table,
 * similar to how PostgreSQL sequences work. This allows bulk ID assignment before INSERT.
 *
 * The sequence table schema:
 * ```sql
 * CREATE TABLE IF NOT EXISTS _joist_sequences (
 *   table_name TEXT PRIMARY KEY,
 *   next_id INTEGER NOT NULL DEFAULT 1
 * );
 * ```
 */
export class SqliteSequenceIdAssigner implements IdAssigner {
  #db: Database.Database;
  #initialized = false;

  constructor(db: Database.Database) {
    this.#db = db;
  }

  async assignNewIds(todos: Record<string, Todo>): Promise<void> {
    this.#ensureSequenceTable();

    for (const todo of Object.values(todos)) {
      const needsIds = todo.inserts.filter((e) => e.idMaybe === undefined);
      if (needsIds.length === 0) continue;

      const tableName = todo.metadata.tableName;
      const count = needsIds.length;

      // Reserve a range of IDs atomically
      const startId = this.#reserveIds(tableName, count);

      // Assign the reserved IDs to each entity
      for (let i = 0; i < needsIds.length; i++) {
        getInstanceData(needsIds[i]).data["id"] = keyToTaggedId(todo.metadata, startId + i);
      }
    }
  }

  #ensureSequenceTable(): void {
    if (this.#initialized) return;
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS _joist_sequences (
        table_name TEXT PRIMARY KEY,
        next_id INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.#initialized = true;
  }

  #reserveIds(tableName: string, count: number): number {
    // Insert the table entry if it doesn't exist
    this.#db.prepare(`
      INSERT OR IGNORE INTO _joist_sequences (table_name, next_id)
      VALUES (?, 1)
    `).run(tableName);

    // Get current next_id and increment atomically
    const result = this.#db.prepare(`
      UPDATE _joist_sequences
      SET next_id = next_id + ?
      WHERE table_name = ?
      RETURNING next_id - ? as start_id
    `).get(count, tableName, count) as { start_id: number } | undefined;

    if (!result) {
      throw new Error(`Failed to reserve IDs for table ${tableName}`);
    }

    return result.start_id;
  }
}

/**
 * A simpler ID assigner that uses SQLite's actual autoincrement.
 *
 * This requires entities to be inserted one at a time or in smaller batches
 * where we can capture the last_insert_rowid(). Use SqliteSequenceIdAssigner
 * for better bulk insert performance.
 *
 * Note: This assigner works by querying the current max ID and reserving a range.
 * It's safe within a transaction but may have race conditions across transactions.
 */
export class SqliteMaxIdAssigner implements IdAssigner {
  #db: Database.Database;

  constructor(db: Database.Database) {
    this.#db = db;
  }

  async assignNewIds(todos: Record<string, Todo>): Promise<void> {
    for (const todo of Object.values(todos)) {
      const needsIds = todo.inserts.filter((e) => e.idMaybe === undefined);
      if (needsIds.length === 0) continue;

      const tableName = todo.metadata.tableName;

      // Get the current max ID (or 0 if table is empty)
      const result = this.#db.prepare(`SELECT COALESCE(MAX(id), 0) as max_id FROM "${tableName}"`).get() as {
        max_id: number;
      };
      const startId = result.max_id + 1;

      // Assign sequential IDs starting from max + 1
      for (let i = 0; i < needsIds.length; i++) {
        getInstanceData(needsIds[i]).data["id"] = keyToTaggedId(todo.metadata, startId + i);
      }
    }
  }
}

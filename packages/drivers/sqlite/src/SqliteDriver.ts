import type Database from "better-sqlite3";
import {
  type DeleteOp,
  type Driver,
  type DriverQueryResult,
  type EntityManager,
  type IdAssigner,
  type InsertOp,
  JoinRowOperation,
  type JoinRowTodo,
  type ParsedFindQuery,
  type PreloadPlugin,
  type Todo,
  type UpdateOp,
  buildRawQuery,
  cleanSql,
  driverAfterBegin,
  driverAfterCommit,
  driverBeforeBegin,
  driverBeforeCommit,
  fail,
  generateOps,
  getRuntimeConfig,
  kq,
  kqDot,
  partition,
} from "joist-core";

import { SqliteAutoIncrementIdAssigner } from "./SqliteIdAssigner.ts";

export interface SqliteDriverOpts {
  idAssigner?: IdAssigner;
  preloadPlugin?: PreloadPlugin;
}

/**
 * Transaction type for SQLite - wraps the database instance during a transaction.
 *
 * better-sqlite3 uses synchronous transactions, so we wrap the db reference
 * to indicate we're in a transaction context.
 */
export interface SqliteTransaction {
  db: Database.Database;
  inTransaction: boolean;
}

/**
 * Implements the `Driver` interface for SQLite using better-sqlite3.
 *
 * Key differences from PostgreSQL:
 * - Uses prepared row statements inside a transaction for bulk writes
 * - Foreign keys are disabled by default; use PRAGMA foreign_keys = ON
 * - Supports deferred foreign keys when declared by the schema
 * - No native array types - arrays stored as JSON
 */
export class SqliteDriver implements Driver<SqliteTransaction> {
  // SQLite has no network round trips to amortize, and the combined find queries use PostgreSQL-only SQL.
  readonly batchQueries = false;

  readonly #db: Database.Database;
  readonly #idAssigner: IdAssigner;
  readonly #preloadPlugin: PreloadPlugin | undefined;

  constructor(db: Database.Database, opts?: SqliteDriverOpts) {
    this.#db = db;
    this.#idAssigner = opts?.idAssigner ?? new SqliteAutoIncrementIdAssigner(db);
    this.#preloadPlugin = opts?.preloadPlugin;

    // Enable foreign key constraints
    this.#db.pragma("foreign_keys = ON");
  }

  async executeFind(
    em: EntityManager,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): Promise<any[]> {
    const { sql, bindings } = buildRawQuery(parsed, { limit: em.entityLimit, ...settings });
    return (await this.executeQuery(em, sql, bindings)).rows;
  }

  /** Returns SQLite's changed-row count for writes, and the selected-row count for reads. */
  async executeQuery(em: EntityManager, sql: string, bindings: readonly any[]): Promise<DriverQueryResult> {
    const stmt = this.#getDb(em).prepare(adaptSqlForSqlite(sql));
    // Convert bindings: replace undefined with null, handle arrays as JSON
    const adaptedBindings = bindings.map(adaptBinding);
    // `reader` is true for SELECTs and for writes with a RETURNING clause
    if (stmt.reader) {
      const rows = stmt.all(...adaptedBindings);
      parseRows(stmt, rows);
      return { rowCount: rows.length, rows };
    }
    return { rowCount: stmt.run(...adaptedBindings).changes, rows: [] };
  }

  async transaction<T>(em: EntityManager, fn: (txn: SqliteTransaction) => Promise<T>): Promise<T> {
    if (em.txn) {
      return fn(em.txn as SqliteTransaction);
    }

    const txn: SqliteTransaction = { db: this.#db, inTransaction: true };
    await driverBeforeBegin(em, txn);

    // better-sqlite3 uses synchronous transactions, but we need async for hooks
    // Use manual BEGIN/COMMIT/ROLLBACK for async compatibility
    this.#db.exec("BEGIN IMMEDIATE");
    em.txn = txn;
    let result: T;
    try {
      await driverAfterBegin(em, txn);
      result = await fn(txn);
      await driverBeforeCommit(em, txn);
      this.#db.exec("COMMIT");
    } catch (e) {
      this.#db.exec("ROLLBACK");
      throw e;
    } finally {
      em.txn = undefined;
    }
    await driverAfterCommit(em, txn);
    return result;
  }

  async assignNewIds(_: EntityManager, todos: Record<string, Todo>): Promise<void> {
    return this.#idAssigner.assignNewIds(todos);
  }

  async flush(
    em: EntityManager,
    entityTodos: Record<string, Todo>,
    joinRows: Record<string, JoinRowTodo>,
  ): Promise<void> {
    const { db } = (em.txn ?? fail("Expected EntityManager.txn to be set")) as SqliteTransaction;
    await this.#idAssigner.assignNewIds(entityTodos);
    const ops = generateOps(entityTodos);

    // Do INSERTs+UPDATEs first so that we avoid DELETE cascades invalidating oplocks
    // See https://github.com/joist-orm/joist-orm/issues/591
    // SQLite is single-threaded, so running these serially loses nothing.
    for (const op of ops.inserts) batchInsert(db, op);
    for (const op of ops.updates) batchUpdate(db, op);
    for (const op of ops.deletes) batchDelete(db, op);
    for (const [joinTableName, todo] of Object.entries(joinRows)) {
      m2mBatchInsert(db, joinTableName, todo);
      m2mBatchDelete(db, joinTableName, todo);
    }
  }

  get defaultPlugins() {
    return { preloadPlugin: this.#preloadPlugin };
  }

  #getDb(em: EntityManager): Database.Database {
    return (em.txn as SqliteTransaction | undefined)?.db ?? this.#db;
  }
}

/** Inserts each row with native bindings, reusing one prepared statement within the flush transaction. */
function batchInsert(db: Database.Database, op: InsertOp): void {
  const { tableName, columns, columnValues } = op;
  if (columnValues.length === 0 || columnValues[0].length === 0) return;

  // Joining one json_each per column can produce a combinatorial scan for wide entities such as Author.
  const stmt = db.prepare(
    cleanSql(`
    INSERT INTO ${kq(tableName)} (${columns.map((c) => kq(c.columnName)).join(", ")})
    VALUES (${columns.map(() => "?").join(", ")})
  `),
  );
  for (let row = 0; row < columnValues[0].length; row++) {
    stmt.run(...columnValues.map((values) => adaptBinding(values[row])));
  }
}

/**
 * Updates each row with a reused prepared statement and checks its optimistic lock.
 *
 * The enclosing flush transaction rolls back all rows if any original timestamp no longer matches.
 */
function batchUpdate(db: Database.Database, op: UpdateOp): void {
  const { tableName, columns, columnValues, updatedAt } = op;
  if (columnValues.length === 0 || columnValues[0].length === 0) return;

  const idIndex = columns.findIndex((column) => column.columnName === "id");
  const originalUpdatedAtIndex = columns.findIndex((column) => column.columnName === "__original_updated_at");
  const fields = columns
    .map((column, index) => ({ column, index }))
    .filter((field) => field.index !== idIndex && field.index !== originalUpdatedAtIndex);
  const stmt = db.prepare(
    cleanSql(`
    UPDATE ${kq(tableName)}
    SET ${fields.map((field) => `${kq(field.column.columnName)} = ?`).join(", ")}
    WHERE id = ?${updatedAt ? ` AND ${kqDot(tableName, updatedAt)} = ?` : ""}
  `),
  );

  let changes = 0;
  const ids = columnValues[idIndex];
  for (let row = 0; row < ids.length; row++) {
    const bindings = fields.map((field) => adaptBinding(columnValues[field.index][row]));
    bindings.push(adaptBinding(ids[row]));
    if (updatedAt) bindings.push(adaptBinding(columnValues[originalUpdatedAtIndex][row]));
    changes += stmt.run(...bindings).changes;
  }
  if (changes !== ids.length) {
    throw new Error(`Oplock failure for ${tableName}: expected ${ids.length} updates, got ${changes}`);
  }
}

function batchDelete(db: Database.Database, op: DeleteOp): void {
  const { tableName, ids } = op;
  if (ids.length === 0) return;
  db.prepare(`DELETE FROM ${kq(tableName)} WHERE id IN (SELECT value FROM json_each(?))`).run(JSON.stringify(ids));
}

function m2mBatchInsert(db: Database.Database, joinTableName: string, todo: JoinRowTodo): void {
  const { m2m, newRows } = todo;
  if (newRows.length === 0) return;

  const col1 = kq(m2m.columnName);
  const col2 = kq(m2m.otherColumnName);
  const bindings = newRows.flatMap((row) => [
    todo.dbValue(row, m2m.columnName),
    todo.dbValue(row, m2m.otherColumnName),
  ]);
  const values = newRows.map(() => "(?, ?)").join(", ");

  if (m2m.hasJoinTableId) {
    // The no-op `DO UPDATE` (instead of `DO NOTHING`) makes RETURNING include rows that already existed
    const sql = cleanSql(`
      INSERT INTO ${kq(joinTableName)} (${col1}, ${col2})
      VALUES ${values}
      ON CONFLICT (${col1}, ${col2}) DO UPDATE SET id = id
      RETURNING id
    `);
    const rows = db.prepare(sql).all(...bindings) as { id: number }[];
    for (let i = 0; i < rows.length; i++) {
      newRows[i].id = rows[i].id;
      newRows[i].op = JoinRowOperation.Flushed;
      newRows[i].persisted = true;
    }
  } else {
    // Id-less join tables have no surrogate id to return; the FK pair is the PK, so just
    // insert and let any duplicate be a no-op.
    const sql = cleanSql(`
      INSERT INTO ${kq(joinTableName)} (${col1}, ${col2})
      VALUES ${values}
      ON CONFLICT (${col1}, ${col2}) DO NOTHING
    `);
    db.prepare(sql).run(...bindings);
    for (const row of newRows) {
      row.op = JoinRowOperation.Flushed;
      row.persisted = true;
    }
  }
}

function m2mBatchDelete(db: Database.Database, joinTableName: string, todo: JoinRowTodo): void {
  const { m2m, deletedRows } = todo;
  if (deletedRows.length === 0) return;

  // Rows with a surrogate id are deleted by id; rows without one — id-less tables, or `remove`s
  // done against an unloaded ManyToManyCollection — are deleted by their (col1, col2) composite.
  // See the PostgresDriver for why `id !== -1` is still checked.
  const [haveIds, noIds] = partition(deletedRows, (r) => r.id !== undefined && r.id !== -1);
  if (haveIds.length > 0) {
    db.prepare(`DELETE FROM ${kq(joinTableName)} WHERE id IN (SELECT value FROM json_each(?))`).run(
      JSON.stringify(haveIds.map((r) => r.id!)),
    );
  }

  // Watch for m2m rows that got added-then-removed to entities that were themselves added-then-removed,
  // as they have no db values, as we're skipping adding them to the database.
  const validRows = noIds.filter((row) => !todo.isNew(row, m2m.columnName) && !todo.isNew(row, m2m.otherColumnName));
  if (validRows.length > 0) {
    const bindings = validRows.flatMap((row) => [
      todo.dbValue(row, m2m.columnName),
      todo.dbValue(row, m2m.otherColumnName),
    ]);
    db.prepare(`
      DELETE FROM ${kq(joinTableName)}
      WHERE (${kq(m2m.columnName)}, ${kq(m2m.otherColumnName)}) IN (VALUES ${validRows.map(() => "(?, ?)").join(", ")})
    `).run(...bindings);
  }

  for (const row of deletedRows) {
    row.id = undefined;
    row.persisted = false;
    row.op = JoinRowOperation.Flushed;
  }
}

/**
 * Adapt JavaScript values for SQLite binding.
 */
function adaptBinding(value: any): any {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? 1 : 0;
  // Arrays and jsonb objects are stored as JSON text; Buffers are BLOBs, which SQLite binds natively
  if (typeof value === "object" && value !== null && !Buffer.isBuffer(value)) {
    return JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item));
  }
  return value;
}

/**
 * Converts the values that SQLite returns as TEXT or INTEGER into the JS types that `pg` returns.
 *
 * Joist's serdes expect the driver to parse timestamps into `Date`s, booleans into `boolean`s, and
 * jsonb into objects, like `pg-types` does. SQLite stores all of them as TEXT/INTEGER, but each
 * result column still has its declared type, i.e. `created_at TIMESTAMPTZ`, so we parse by that.
 */
function parseRows(stmt: Database.Statement, rows: any[]): void {
  if (rows.length === 0) return;
  const parsers: [string, (value: any) => unknown][] = [];
  for (const column of stmt.columns()) {
    // Expressions, i.e. `count(*)`, have no declared type
    const parser = column.type ? columnParser(column.type.toLowerCase()) : undefined;
    if (parser) parsers.push([column.name, parser]);
  }
  if (parsers.length === 0) return;
  for (const row of rows) {
    for (const [name, parse] of parsers) {
      const value = row[name];
      if (value !== null) row[name] = parse(value);
    }
  }
}

/** Returns the parser for a declared column type, or undefined if SQLite already returns the right JS type. */
function columnParser(declaredType: string): ((value: any) => unknown) | undefined {
  // Shared schemas can retain declared array types while storing the array itself as JSON text.
  if (declaredType.endsWith("[]")) return JSON.parse;
  if (declaredType.startsWith("bool")) return (value) => value === 1;
  if (declaredType.startsWith("json")) return JSON.parse;
  // With Temporal, the serdes parse the strings themselves, the same as with `pg`
  const isDate = declaredType === "date" || declaredType.startsWith("timestamp") || declaredType === "datetime";
  if (isDate && !getRuntimeConfig().temporal) return (value) => new Date(value);
  return undefined;
}

/**
 * Adapt PostgreSQL-style SQL to SQLite dialect.
 *
 * - Replace $1, $2 with ?, for raw `em.execute` SQL written against Postgres
 * - Remove `::type` casts, because SQLite is loosely typed
 * - Remove DISTINCT ON (approximation)
 * - Replace `= ANY(?)` with a json_each lookup, because `adaptBinding` sends arrays as JSON
 */
function adaptSqlForSqlite(sql: string): string {
  return (
    sql
      .replace(/\$\d+/g, "?")
      // This is a simple approach; complex casts may need manual handling
      .replace(/::\w+(\[\])?/g, "")
      // A proper implementation would need query rewriting
      .replace(/DISTINCT ON \([^)]+\)\s*/gi, "")
      .replace(/= ANY\(\?\)/gi, "IN (SELECT value FROM json_each(?))")
  );
}

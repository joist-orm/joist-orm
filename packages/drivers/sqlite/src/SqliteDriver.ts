import type Database from "better-sqlite3";
import {
  buildRawQuery,
  cleanSql,
  DeleteOp,
  Driver,
  driverAfterBegin,
  driverAfterCommit,
  driverBeforeBegin,
  driverBeforeCommit,
  EntityManager,
  fail,
  generateOps,
  getMetadata,
  IdAssigner,
  InsertOp,
  JoinRow,
  JoinRowOperation,
  JoinRowTodo,
  keyToNumber,
  kq,
  kqDot,
  ManyToManyLike,
  OpColumn,
  ParsedFindQuery,
  partition,
  PreloadPlugin,
  Todo,
  UpdateOp,
} from "joist-core";
import { SqliteAutoIncrementIdAssigner } from "./SqliteIdAssigner";

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
 * - Uses VALUES clauses instead of UNNEST for bulk operations
 * - Foreign keys are disabled by default; use PRAGMA foreign_keys = ON
 * - No deferred constraints - relies on topological ordering from generateOps
 * - Uses CAST() instead of :: for type casting
 * - No native array types - arrays stored as JSON
 */
export class SqliteDriver implements Driver<SqliteTransaction> {
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
    return this.executeQuery(em, adaptSqlForSqlite(sql), bindings);
  }

  async executeQuery(em: EntityManager, sql: string, bindings: readonly any[]): Promise<any[]> {
    const db = this.#getDb(em);
    const adaptedSql = adaptSqlForSqlite(sql);
    const stmt = db.prepare(adaptedSql);
    // Convert bindings: replace undefined with null, handle arrays as JSON
    const adaptedBindings = bindings.map(adaptBinding);
    return stmt.all(...adaptedBindings) as any[];
  }

  async transaction<T>(em: EntityManager, fn: (txn: SqliteTransaction) => Promise<T>): Promise<T> {
    if (em.txn) {
      return fn(em.txn as SqliteTransaction);
    }

    await driverBeforeBegin(em, this.#db);

    // better-sqlite3 uses synchronous transactions, but we need async for hooks
    // Use manual BEGIN/COMMIT/ROLLBACK for async compatibility
    const txn: SqliteTransaction = { db: this.#db, inTransaction: true };
    em.txn = txn;

    this.#db.exec("BEGIN IMMEDIATE");
    try {
      await driverAfterBegin(em, txn);
      const result = await fn(txn);
      await driverBeforeCommit(em, txn);
      this.#db.exec("COMMIT");
      await driverAfterCommit(em, this.#db);
      return result;
    } catch (e) {
      this.#db.exec("ROLLBACK");
      throw e;
    } finally {
      em.txn = undefined;
    }
  }

  async assignNewIds(_: EntityManager, todos: Record<string, Todo>): Promise<void> {
    return this.#idAssigner.assignNewIds(todos);
  }

  async flush(
    em: EntityManager,
    entityTodos: Record<string, Todo>,
    joinRows: Record<string, JoinRowTodo>,
  ): Promise<void> {
    const db = this.#getDb(em);
    await this.#idAssigner.assignNewIds(entityTodos);
    const ops = generateOps(entityTodos);

    // Execute operations - SQLite is single-threaded so no parallel benefit
    for (const op of ops.inserts) {
      batchInsert(db, op);
    }
    for (const op of ops.updates) {
      batchUpdate(db, op);
    }
    for (const op of ops.deletes) {
      batchDelete(db, op);
    }

    // Handle m2m join table operations
    for (const [joinTableName, { m2m, newRows, deletedRows }] of Object.entries(joinRows)) {
      m2mBatchInsert(db, joinTableName, m2m, newRows);
      m2mBatchDelete(db, joinTableName, m2m, deletedRows);
    }
  }

  get defaultPlugins() {
    return { preloadPlugin: this.#preloadPlugin };
  }

  #getDb(em: EntityManager): Database.Database {
    if (em.txn) {
      return (em.txn as SqliteTransaction).db;
    }
    return this.#db;
  }
}

/**
 * Batch insert using SQLite's multi-row VALUES syntax.
 *
 * SQLite supports: INSERT INTO table (cols) VALUES (row1), (row2), ...
 * Limited to SQLITE_MAX_VARIABLE_NUMBER (default 999, can be up to 32766)
 */
function batchInsert(db: Database.Database, op: InsertOp): void {
  const { tableName, columns, columnValues } = op;
  if (columnValues.length === 0 || columnValues[0].length === 0) return;

  const rowCount = columnValues[0].length;
  const colNames = columns.map((c) => kq(c.columnName)).join(", ");

  // Build VALUES clause with placeholders
  const rowPlaceholders = `(${columns.map(() => "?").join(", ")})`;
  const allPlaceholders = Array(rowCount).fill(rowPlaceholders).join(", ");

  const sql = `INSERT INTO ${kq(tableName)} (${colNames}) VALUES ${allPlaceholders}`;

  // Flatten column-wise data to row-wise for SQLite
  const bindings = flattenColumnValuesToRows(columns, columnValues);

  db.prepare(sql).run(...bindings);
}

/**
 * Batch update using json_each to pass columnar data.
 *
 * Each column's values are passed as a JSON array, then joined by key index:
 * UPDATE table SET col = data.col FROM (
 *   SELECT ids.value AS id, c1.value AS col1, ...
 *   FROM json_each(?1) ids
 *   JOIN json_each(?2) c1 ON c1.key = ids.key
 *   ...
 * ) AS data WHERE table.id = data.id
 */
function batchUpdate(db: Database.Database, op: UpdateOp): void {
  const { tableName, columns, columnValues, updatedAt } = op;
  if (columnValues.length === 0 || columnValues[0].length === 0) return;

  // Build the FROM subquery with json_each joins
  // First column (id) is the base; remaining columns join on key
  const selects = columns.map((c) => `${kq(c.columnName)}.value AS ${kq(c.columnName)}`).join(", ");
  const baseTable = `json_each(?) ${kq(columns[0].columnName)}`;
  const joins = columns
    .slice(1)
    .map((c) => `JOIN json_each(?) ${kq(c.columnName)} ON ${kq(c.columnName)}.key = ${kq(columns[0].columnName)}.key`)
    .join("\n    ");

  const setClause = columns
    .filter((c) => c.columnName !== "id" && c.columnName !== "__original_updated_at")
    .map((c) => `${kq(c.columnName)} = data.${kq(c.columnName)}`)
    .join(", ");

  let whereClause = `${kq(tableName)}.id = data.id`;
  if (updatedAt) {
    whereClause += ` AND ${kqDot(tableName, updatedAt)} = data.__original_updated_at`;
  }

  const sql = cleanSql(`
    UPDATE ${kq(tableName)}
    SET ${setClause}
    FROM (
      SELECT ${selects}
      FROM ${baseTable}
      ${joins}
    ) AS data
    WHERE ${whereClause}
  `);

  // Bindings are the column arrays as JSON
  const bindings = columnValues.map((col) => JSON.stringify(col.map(adaptBinding)));
  const result = db.prepare(sql).run(...bindings);

  const ids = columnValues[0];
  if (result.changes !== ids.length) {
    throw new Error(`Oplock failure for ${tableName}: expected ${ids.length} updates, got ${result.changes}`);
  }
}

function batchDelete(db: Database.Database, op: DeleteOp): void {
  const { tableName, ids } = op;
  if (ids.length === 0) return;

  const placeholders = ids.map(() => "?").join(", ");
  const sql = `DELETE FROM ${kq(tableName)} WHERE id IN (${placeholders})`;
  db.prepare(sql).run(...ids);
}

function m2mBatchInsert(
  db: Database.Database,
  joinTableName: string,
  m2m: ManyToManyLike,
  newRows: JoinRow[],
): void {
  if (newRows.length === 0) return;

  const meta1 = getMetadata(m2m.entity);
  const meta2 = m2m.otherMeta;
  const col1 = kq(m2m.columnName);
  const col2 = kq(m2m.otherColumnName);

  const rowPlaceholders = "(?, ?)";
  const allPlaceholders = Array(newRows.length).fill(rowPlaceholders).join(", ");

  // SQLite uses INSERT OR IGNORE for conflict handling (or ON CONFLICT DO NOTHING)
  const sql = `
    INSERT INTO ${kq(joinTableName)} (${col1}, ${col2})
    VALUES ${allPlaceholders}
    ON CONFLICT (${col1}, ${col2}) DO UPDATE SET id = id
    RETURNING id
  `;

  const bindings: any[] = [];
  for (const row of newRows) {
    bindings.push(keyToNumber(meta1, row.columns[m2m.columnName].idTagged));
    bindings.push(keyToNumber(meta2, row.columns[m2m.otherColumnName].idTagged));
  }

  const results = db.prepare(sql).all(...bindings) as { id: number }[];
  for (let i = 0; i < results.length; i++) {
    newRows[i].id = results[i].id;
    newRows[i].op = JoinRowOperation.Flushed;
  }
}

function m2mBatchDelete(
  db: Database.Database,
  joinTableName: string,
  m2m: ManyToManyLike,
  deletedRows: JoinRow[],
): void {
  if (deletedRows.length === 0) return;

  const [haveIds, noIds] = partition(deletedRows, (r) => r.id !== -1);

  if (haveIds.length > 0) {
    const placeholders = haveIds.map(() => "?").join(", ");
    db.prepare(`DELETE FROM ${kq(joinTableName)} WHERE id IN (${placeholders})`).run(...haveIds.map((r) => r.id!));
  }

  if (noIds.length > 0) {
    const validRows = noIds.filter((row) => {
      const e1 = row.columns[m2m.columnName];
      const e2 = row.columns[m2m.otherColumnName];
      return !e1.isNewEntity && !e2.isNewEntity;
    });

    if (validRows.length > 0) {
      const placeholders = validRows.map(() => "(?, ?)").join(", ");
      const bindings: any[] = [];
      for (const row of validRows) {
        bindings.push(keyToNumber(m2m.meta, row.columns[m2m.columnName].idTagged));
        bindings.push(keyToNumber(m2m.otherMeta, row.columns[m2m.otherColumnName].idTagged));
      }

      db.prepare(`
        DELETE FROM ${kq(joinTableName)}
        WHERE (${kq(m2m.columnName)}, ${kq(m2m.otherColumnName)}) IN (VALUES ${placeholders})
      `).run(...bindings);
    }
  }

  for (const row of deletedRows) {
    row.id = undefined;
    row.op = JoinRowOperation.Flushed;
  }
}

/**
 * Convert columnar data to row-wise bindings for SQLite's VALUES clause.
 *
 * Input: [[id1, id2], [name1, name2]] (column-wise)
 * Output: [id1, name1, id2, name2] (row-wise for VALUES (?,?),(?,?))
 */
function flattenColumnValuesToRows(columns: OpColumn[], columnValues: any[][]): any[] {
  const rowCount = columnValues[0]?.length ?? 0;
  const bindings: any[] = [];

  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < columns.length; col++) {
      bindings.push(adaptBinding(columnValues[col][row]));
    }
  }

  return bindings;
}

/**
 * Adapt JavaScript values for SQLite binding.
 */
function adaptBinding(value: any): any {
  if (value === undefined) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

/**
 * Adapt PostgreSQL-style SQL to SQLite dialect.
 *
 * - Replace `::type` casts with CAST(x AS type)
 * - Replace DISTINCT ON with GROUP BY (approximation)
 * - Replace $1, $2 with ?
 * - Handle other PostgreSQL-specific syntax
 */
function adaptSqlForSqlite(sql: string): string {
  let adapted = sql;

  // Replace PostgreSQL-style numbered parameters ($1, $2) with ?
  adapted = adapted.replace(/\$\d+/g, "?");

  // Remove PostgreSQL type casts (::type) - SQLite is loosely typed
  // This is a simple approach; complex casts may need manual handling
  adapted = adapted.replace(/::\w+(\[\])?/g, "");

  // Replace PostgreSQL's DISTINCT ON with a subquery approach
  // This is a simplified transformation that may not work for all cases
  const distinctOnMatch = adapted.match(/DISTINCT ON \([^)]+\)/i);
  if (distinctOnMatch) {
    // For now, just remove DISTINCT ON and let GROUP BY handle deduplication
    // A proper implementation would need query rewriting
    adapted = adapted.replace(/DISTINCT ON \([^)]+\)\s*/gi, "");
  }

  // Replace ANY(?) with IN (?)
  adapted = adapted.replace(/= ANY\(\?\)/gi, "IN (?)");

  // Replace unnest with JSON functions if present (for complex cases)
  // Simple unnest calls are handled differently in batch operations

  return adapted;
}

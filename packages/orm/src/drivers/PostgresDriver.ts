import {
  buildRawQuery,
  cleanSql,
  DeleteOp,
  Driver,
  driverAfterBegin,
  driverAfterCommit,
  driverBeforeBegin,
  driverBeforeCommit,
  ensureRectangularArraySizes,
  EntityManager,
  fail,
  generateOps,
  getRuntimeConfig,
  IdAssigner,
  InsertOp,
  JoinRowOperation,
  JoinRowTodo,
  kq,
  kqDot,
  OpColumn,
  ParsedFindQuery,
  partition,
  PreloadPlugin,
  RowData,
  RuntimeConfig,
  SequenceIdAssigner,
  Todo,
  UpdateOp,
} from "joist-core";
import pg from "pg";
import { builtins, getTypeParser } from "pg-types";
import array from "postgres-array";
import { ensureLazyDataRows } from "./patchPgProtocol";
import { executeRowDataQuery } from "./WireRowData";

export interface PostgresDriverOpts {
  idAssigner?: IdAssigner;
  /** Sets a default `PreloadPlugin` for any `EntityManager` that uses this driver. */
  preloadPlugin?: PreloadPlugin;
  /** Called after each query is executed, useful for testing/debugging. */
  onQuery?: (sql: string) => void;
  /**
   * Keeps entity find results as raw wire bytes and decodes each row/column cell lazily on
   * field access, instead of eagerly materializing POJO rows; see JS-ROW-STORE-DESIGN.md.
   */
  lazyRows?: boolean;
}

/**
 * Provides a callback for tests/debugging.
 *
 * We used to get this for-free from knex, but node-pg does not have a `query` event.
 */
type OnQuery = ((sql: string) => void) | undefined;

/**
 * Implements the `Driver` interface for Postgres.
 *
 * This is the canonical driver implementation and leverages several aspects of
 * Postgres for the best performance, i.e.:
 *
 * - Deferred foreign key constraints are used to allow bulk inserting/updating
 * all entities without any topographic sorting/ordering issues.
 *
 * - Sequences are used to bulk-assign + then bulk-insert all entities, to again
 * avoid issues with ordering issues (cannot bulk insert A w/o knowing the id of B).
 *
 * - We use a pg-specific bulk update syntax.
 */
export class PostgresDriver implements Driver<pg.PoolClient> {
  readonly #idAssigner: IdAssigner;
  readonly #preloadPlugin: PreloadPlugin | undefined;
  readonly #onQuery: OnQuery;
  readonly lazyRows: boolean;

  constructor(
    readonly pool: pg.Pool,
    opts?: PostgresDriverOpts,
  ) {
    this.#idAssigner =
      opts?.idAssigner ??
      new SequenceIdAssigner(async (sql: string) => {
        this.#onQuery?.(sql);
        return (await pool.query(sql)).rows;
      });
    this.#preloadPlugin = opts?.preloadPlugin;
    this.#onQuery = opts?.onQuery;
    // Lazy rows require pg-protocol to emit lazy DataRows, which we patch in at runtime; if the
    // patch cannot be applied/verified (i.e. future pg-protocol internals changed), stay classic
    this.lazyRows = (opts?.lazyRows ?? false) && ensureLazyDataRows();
    if (opts?.lazyRows && !this.lazyRows) {
      console.warn("joist-orm: lazyRows was requested, but patching pg-protocol failed; using classic rows.");
    }
    setupLatestPgTypes(getRuntimeConfig().temporal);
  }

  async executeFind(
    em: EntityManager,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): Promise<any[]> {
    const { sql, bindings } = buildRawQuery(parsed, { limit: em.entityLimit, ...settings });
    return this.executeQuery(em, sql, bindings);
  }

  async executeFindRowData(
    em: EntityManager,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): Promise<RowData> {
    const { sql, bindings } = buildRawQuery(parsed, { limit: em.entityLimit, ...settings });
    const pgSql = toPgParams(sql);
    this.#onQuery?.(pgSql);
    return executeRowDataQuery(this.getMaybeInTxnClient(em), pgSql, bindings);
  }

  async executeQuery(em: EntityManager, sql: string, bindings: readonly any[]): Promise<any[]> {
    const pgSql = toPgParams(sql);
    this.#onQuery?.(pgSql);
    const client = this.getMaybeInTxnClient(em);
    return client.query(pgSql, bindings as any[]).then((result) => result.rows);
  }

  async transaction<T>(em: EntityManager, fn: (txn: pg.PoolClient) => Promise<T>): Promise<T> {
    if (em.txn) {
      return fn(em.txn as pg.PoolClient);
    }
    const client = await this.pool.connect();
    let result: T;
    try {
      await driverBeforeBegin(em, client);
      this.#onQuery?.("BEGIN;");
      await client.query("BEGIN");
      em.txn = client;
      try {
        await driverAfterBegin(em, client);
        result = await fn(client);
        await driverBeforeCommit(em, client);
        this.#onQuery?.("COMMIT;");
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        em.txn = undefined;
      }
      await driverAfterCommit(em, client);
    } finally {
      client.release();
    }
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
    const client = (em.txn ?? fail("Expected EntityManager.txn to be set")) as pg.PoolClient;
    await this.#idAssigner.assignNewIds(entityTodos);
    const ops = generateOps(entityTodos);
    const onQuery = this.#onQuery;
    // Do INSERTs+UPDATEs first so that we avoid DELETE cascades invalidating oplocks
    // See https://github.com/joist-orm/joist-orm/issues/591
    await Promise.all([
      ...ops.inserts.map((op) => batchInsert(client, op, onQuery)),
      ...ops.updates.map((op) => batchUpdate(client, op, onQuery)),
      ...ops.deletes.map((op) => batchDelete(client, op, onQuery)),
      ...Object.entries(joinRows).flatMap(([joinTableName, todo]) => {
        return [
          m2mBatchInsert(client, joinTableName, todo, onQuery),
          m2mBatchDelete(client, joinTableName, todo, onQuery),
        ];
      }),
    ]);
  }

  get defaultPlugins() {
    return { preloadPlugin: this.#preloadPlugin };
  }

  private getMaybeInTxnClient(em: EntityManager): pg.PoolClient | pg.Pool {
    return (em.txn as pg.PoolClient) || this.pool;
  }
}

async function batchInsert(client: pg.PoolClient, op: InsertOp, onQuery: OnQuery): Promise<unknown> {
  const { tableName, columns, columnValues } = op;
  const [cte, bindings] = buildUnnestCte("data", columns, columnValues);
  const sql = cleanSql(`
    ${cte}
    INSERT INTO ${kq(tableName)} (${columns.map((c) => kq(c.columnName)).join(", ")})
    SELECT * FROM data
  `);
  const pgSql = toPgParams(sql);
  onQuery?.(pgSql);
  return client.query(pgSql, bindings);
}

async function batchUpdate(client: pg.PoolClient, op: UpdateOp, onQuery: OnQuery): Promise<void> {
  const { tableName, columns, columnValues, updatedAt } = op;

  const [cte, bindings] = buildUnnestCte("data", columns, columnValues);

  // JS Dates only have millisecond-level precision, so we may have dropped/lost accuracy when
  // reading Postgres's microsecond-level `timestamptz` values; using `date_trunc` "downgrades"
  // the pg data to match what we have in the JS Date.
  //
  // ...but Temporal's types don't have this flaw.
  const truncateToMills = !getRuntimeConfig().temporal;
  const maybeUpdatedAt =
    updatedAt && truncateToMills
      ? ` AND date_trunc('milliseconds', ${kqDot(tableName, updatedAt)}) = data.__original_updated_at`
      : updatedAt
        ? ` AND ${kqDot(tableName, updatedAt)} = data.__original_updated_at`
        : "";

  const sql = `
    ${cte}
    UPDATE ${kq(tableName)}
    SET ${columns
      .filter((c) => c.columnName !== "id" && c.columnName !== "__original_updated_at")
      .map((c) => `${kq(c.columnName)} = data.${kq(c.columnName)}`)
      .join(", ")}
    FROM data
    WHERE ${kq(tableName)}.id = data.id ${maybeUpdatedAt}
    RETURNING ${kq(tableName)}.id
  `;

  const pgSql = toPgParams(cleanSql(sql));
  onQuery?.(pgSql);
  const result = await client.query(pgSql, bindings);
  const results = result.rows;

  const ids = columnValues[0]; // assume id is the 1st column
  if (results.length !== ids.length) {
    const updated = new Set(results.map((r: any) => r.id));
    const missing = ids.filter((id) => !updated.has(id));
    throw new Error(`Oplock failure for ${tableName} rows ${missing.join(", ")}`);
  }
}

async function batchDelete(client: pg.PoolClient, op: DeleteOp, onQuery: OnQuery): Promise<void> {
  const { tableName, ids } = op;
  const pgSql = toPgParams(`DELETE FROM ${kq(tableName)} WHERE id = ANY(?)`);
  onQuery?.(pgSql);
  await client.query(pgSql, [ids]);
}

/** Creates a CTE named `tableName` that bulk-injects the `columnValues` into a SQL query. */
function buildUnnestCte(tableName: string, columns: OpColumn[], columnValues: any[][]): [string, any[][]] {
  ensureRectangularArraySizes(columns, columnValues);
  const selects = columns.map((c) => {
    if (c.dbType.endsWith("[]")) {
      if (c.isNullableArray) {
        return `unnest_arrays(?::${c.dbType}[], true) as ${kq(c.columnName)}`;
      } else {
        return `unnest_arrays(?::${c.dbType}[]) as ${kq(c.columnName)}`;
      }
    } else {
      return `unnest(?::${c.dbType}[]) as ${kq(c.columnName)}`;
    }
  });
  const sql = `WITH ${tableName} AS (SELECT ${selects.join(", ")})`;
  return [sql, columnValues];
}

async function m2mBatchInsert(client: pg.PoolClient, joinTableName: string, todo: JoinRowTodo, onQuery: OnQuery) {
  const { m2m, newRows } = todo;
  if (newRows.length === 0) return;
  const col1Values = newRows.map((row) => todo.dbValue(row, m2m.columnName));
  const col2Values = newRows.map((row) => todo.dbValue(row, m2m.otherColumnName));
  if (m2m.hasJoinTableId) {
    const sql = cleanSql(`
      WITH data AS (SELECT unnest(?::int[]) as ${kq(m2m.columnName)}, unnest(?::int[]) as ${kq(m2m.otherColumnName)})
      INSERT INTO ${kq(joinTableName)} (${kq(m2m.columnName)}, ${kq(m2m.otherColumnName)})
      SELECT * FROM data
      ON CONFLICT (${kq(m2m.columnName)}, ${kq(m2m.otherColumnName)}) DO UPDATE SET id = ${kq(joinTableName)}.id
      RETURNING id;
    `);
    const pgSql = toPgParams(sql);
    onQuery?.(pgSql);
    const { rows } = await client.query(pgSql, [col1Values, col2Values]);
    for (let i = 0; i < rows.length; i++) {
      newRows[i].id = rows[i].id;
      newRows[i].op = JoinRowOperation.Flushed;
      newRows[i].persisted = true;
    }
  } else {
    // Id-less join tables have no surrogate id to return; the FK pair is the PK, so just
    // insert and let any duplicate be a no-op.
    const sql = cleanSql(`
      WITH data AS (SELECT unnest(?::int[]) as ${kq(m2m.columnName)}, unnest(?::int[]) as ${kq(m2m.otherColumnName)})
      INSERT INTO ${kq(joinTableName)} (${kq(m2m.columnName)}, ${kq(m2m.otherColumnName)})
      SELECT * FROM data
      ON CONFLICT (${kq(m2m.columnName)}, ${kq(m2m.otherColumnName)}) DO NOTHING;
    `);
    const pgSql = toPgParams(sql);
    onQuery?.(pgSql);
    await client.query(pgSql, [col1Values, col2Values]);
    for (const row of newRows) {
      row.op = JoinRowOperation.Flushed;
      row.persisted = true;
    }
  }
}

async function m2mBatchDelete(client: pg.PoolClient, joinTableName: string, todo: JoinRowTodo, onQuery: OnQuery) {
  const { m2m, deletedRows } = todo;
  if (deletedRows.length === 0) return;
  // Rows with a surrogate id are deleted by id; rows without one — id-less tables, or `remove`s
  // done against an unloaded ManyToManyCollection — are deleted by their (col1, col2) composite.
  const [haveIds, noIds] = partition(deletedRows, (r) => {
    // We used to use `id !== -1` as a marker for "row is/is-not persisted in the db" -- but when adding support
    // for id-column-less m2m tables, we couldn't use `id === -1` as this marker anymore, so now rely on a dedicated
    // `persisted` key instead.
    //
    // So, ideally, this `id !== -1` could go away _except_ that our internal verisoning plugin leverages this "m2m rows
    // with an id=-1 delete by their FK values" to handle our versioned m2m tables. And for now it's easier to
    // keep/restore this `id !== -1` than refactor that.
    return r.id !== undefined && r.id !== -1;
  });
  if (haveIds.length > 0) {
    const pgSql = toPgParams(`DELETE FROM ${kq(joinTableName)} WHERE id = ANY(?)`);
    onQuery?.(pgSql);
    await client.query(pgSql, [haveIds.map((r) => r.id!)]);
  }
  if (noIds.length > 0) {
    const data = noIds
      // Watch for m2m rows that got added-then-removed to entities that were themselves added-then-removed,
      // as the deTagId will be undefined for those, as we're skipping adding them to the database.
      .filter((row) => !todo.isNew(row, m2m.columnName) && !todo.isNew(row, m2m.otherColumnName))
      .map((row) => [todo.dbValue(row, m2m.columnName), todo.dbValue(row, m2m.otherColumnName)] as any);
    if (data.length > 0) {
      const pgSql = toPgParams(`
        DELETE FROM ${kq(joinTableName)}
        WHERE (${kq(m2m.columnName)}, ${kq(m2m.otherColumnName)}) IN (
          SELECT (data->>0)::int, (data->>1)::int FROM jsonb_array_elements(?) data
        )`);
      onQuery?.(pgSql);
      await client.query(pgSql, [JSON.stringify(data)]);
    }
  }
  deletedRows.forEach((row) => {
    row.id = undefined;
    row.persisted = false;
    row.op = JoinRowOperation.Flushed;
  });
}

/**
 * Configures the `pg` driver with the best type parsers.
 *
 * In particular, pg's default `TIMESTAMPTZ` parser is very inefficient, and even just
 * pulling in the latest `pg-types` and installing the fixed parser makes a noticable
 * difference.
 */
export function setupLatestPgTypes(temporal: RuntimeConfig["temporal"]): void {
  if (temporal) {
    // Don't eagerly parse the strings, instead defer to the serde logic
    const noop = (s: string) => s;
    const noopArray = (s: string) => array.parse(s, noop);

    const { TIMESTAMP, TIMESTAMPTZ, DATE } = pg.types.builtins;
    pg.types.setTypeParser(DATE, noop);
    pg.types.setTypeParser(TIMESTAMP, noop);
    pg.types.setTypeParser(TIMESTAMPTZ, noop);

    // Use `as number` b/c the typings of shadowed pg-types from `pg` and `pg-types` top-level don't line up
    pg.types.setTypeParser(1182 as number, noopArray); // date[]
    pg.types.setTypeParser(1115 as number, noopArray); // timestamp[]
    pg.types.setTypeParser(1185 as number, noopArray); // timestamptz[]
  } else {
    pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, getTypeParser(builtins.TIMESTAMPTZ));
  }
}

const questionMarks = /(?<!@)\?/g;

/**
 * Converts our knex-style `?` placeholders to pg-native `$1, $2, ...` numbered parameters.
 *
 * We skipping postgres operators like `@?`. */
function toPgParams(sql: string): string {
  let i = 0;
  return sql.replace(questionMarks, () => `$${++i}`);
}

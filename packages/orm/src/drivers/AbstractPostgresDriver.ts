import {
  type DeleteOp,
  type Driver,
  type DriverQueryResult,
  type EntityManager,
  type IdAssigner,
  type InsertOp,
  JoinRowOperation,
  type JoinRowTodo,
  type OpColumn,
  type ParsedFindQuery,
  type PreloadPlugin,
  type RowData,
  SequenceIdAssigner,
  type Todo,
  type UpdateOp,
  buildRawQuery,
  cleanSql,
  ensureRectangularArraySizes,
  fail,
  generateOps,
  getRuntimeConfig,
  kq,
  kqDot,
  partition,
} from "joist-core";

export interface PostgresDriverOpts {
  idAssigner?: IdAssigner;
  /** Sets a default `PreloadPlugin` for any `EntityManager` that uses this driver. */
  preloadPlugin?: PreloadPlugin;
  /** Called after each query is executed, useful for testing/debugging. */
  onQuery?: (sql: string) => void;
  /**
   * Experimental: keeps entity find results as raw wire bytes and decodes each row/column cell
   * lazily on field access, instead of eagerly materializing POJO rows.
   * PostgreJsDriver uses PostgreJS's public RowDecoder hook; PostgresDriver uses the
   * pg-protocol patch. Defaults to false for PostgresDriver and true for PostgreJsDriver.
   *
   * Applies to unpaginated `em.find`, `em.load`, and o2m/o2o/recursive relation loads against
   * either driver. Other loaders deliberately stay classic: paginated finds (small
   * pages, measured neutral), m2m join-table rows (narrow + fully read, where materialized rows
   * measured faster, and `JoinRows` owns/mutates them), lazy columns, and id/count loaders.
   *
   * Both drivers decode binary cells directly. PostgresDriver uses Joist's binary parser
   * registry; PostgreJsDriver uses PostgreJS's native parsers. For PostgresDriver only,
   * `JOIST_LAZY_BINARY=0` reverts lazy queries to text-format results. PostgresDriver
   * uses classic rows when the choice is knowable up-front (patching pg-protocol failed, or the
   * client is unsupported, i.e. pg-native — both warn once). If a connection turns out
   * mid-query to use an unpatched pg-protocol copy (a duplicate `pg` install), the query fails
   * with a descriptive error — a misconfiguration CI builds/smoketests will catch immediately.
   * Note deferred decoding also defers custom-parser errors from `await em.find` to first field
   * access. See JS-ROW-STORE-DESIGN.md.
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
 * Shares PostgreSQL SQL generation and flush behavior across native transports.
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
 *
 * Each concrete driver owns connection checkout, transactions, and row decoding.
 */
export abstract class AbstractPostgresDriver<T> implements Driver<T> {
  readonly #idAssigner: IdAssigner;
  readonly #preloadPlugin: PreloadPlugin | undefined;
  protected readonly onQuery: OnQuery;
  /** Defined only when `lazyRows` is enabled; its presence is the capability signal the EM checks. */
  readonly executeFindRowData: Driver["executeFindRowData"];
  constructor(
    query: QueryRunner,
    readonly lazyRows: boolean,
    opts?: PostgresDriverOpts,
  ) {
    this.#idAssigner =
      opts?.idAssigner ??
      new SequenceIdAssigner(async (sql: string) => {
        this.onQuery?.(sql);
        return (await query(sql, [])).rows;
      });
    this.#preloadPlugin = opts?.preloadPlugin;
    this.onQuery = opts?.onQuery;
    this.executeFindRowData = this.lazyRows
      ? (em, parsed, settings) => this.findRowData(em, parsed, settings)
      : undefined;
  }

  async executeFind(
    em: EntityManager,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): Promise<any[]> {
    const { sql, bindings } = buildRawQuery(parsed, { limit: em.entityLimit, ...settings });
    return (await this.executeQuery(em, sql, bindings)).rows;
  }

  protected abstract findRowData(
    em: EntityManager,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): Promise<RowData>;

  /** Returns PostgreSQL's native command count and raw rows, including null counts for DDL. */
  async executeQuery(em: EntityManager, sql: string, bindings: readonly any[]): Promise<DriverQueryResult> {
    const pgSql = toPgParams(sql);
    this.onQuery?.(pgSql);
    const { rowCount, rows } = await this.query(em.txn as T | undefined, pgSql, bindings);
    return { rowCount, rows };
  }

  abstract transaction<R>(em: EntityManager, fn: (txn: T) => Promise<R>): Promise<R>;

  /** Executes numbered PostgreSQL SQL using the selected transport. */
  protected abstract query(txn: T | undefined, sql: string, bindings: readonly unknown[]): Promise<DriverQueryResult>;

  async assignNewIds(_: EntityManager, todos: Record<string, Todo>): Promise<void> {
    return this.#idAssigner.assignNewIds(todos);
  }

  async flush(
    em: EntityManager,
    entityTodos: Record<string, Todo>,
    joinRows: Record<string, JoinRowTodo>,
  ): Promise<void> {
    const txn = (em.txn ?? fail("Expected EntityManager.txn to be set")) as T;
    const client = { query: (sql: string, bindings: readonly unknown[]) => this.query(txn, sql, bindings) };
    await this.#idAssigner.assignNewIds(entityTodos);
    const ops = generateOps(entityTodos);
    const onQuery = this.onQuery;
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
}

/** A SQL execution boundary, independent of either driver's connection API. */
type QueryRunner = (sql: string, bindings: readonly unknown[]) => Promise<DriverQueryResult>;
type QueryClient = { query: QueryRunner };

async function batchInsert(client: QueryClient, op: InsertOp, onQuery: OnQuery): Promise<unknown> {
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

async function batchUpdate(client: QueryClient, op: UpdateOp, onQuery: OnQuery): Promise<void> {
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

async function batchDelete(client: QueryClient, op: DeleteOp, onQuery: OnQuery): Promise<void> {
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

async function m2mBatchInsert(client: QueryClient, joinTableName: string, todo: JoinRowTodo, onQuery: OnQuery) {
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

async function m2mBatchDelete(client: QueryClient, joinTableName: string, todo: JoinRowTodo, onQuery: OnQuery) {
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

const questionMarks = /(?<!@)\?/g;

/**
 * Converts our knex-style `?` placeholders to pg-native `$1, $2, ...` numbered parameters.
 *
 * We skipping postgres operators like `@?`. */
export function toPgParams(sql: string): string {
  let i = 0;
  return sql.replace(questionMarks, () => `$${++i}`);
}

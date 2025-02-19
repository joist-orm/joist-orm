import { PendingQuery, Sql, TransactionSql } from "postgres";
import {
  appendStack,
  driverAfterBegin,
  driverAfterCommit,
  driverBeforeBegin,
  driverBeforeCommit,
  EntityManager,
  fail,
  getMetadata,
  keyToNumber,
  ParsedFindQuery,
  PreloadPlugin,
} from "../index";
import { JoinRow, JoinRowOperation, ManyToManyLike } from "../JoinRows";
import { kq, kqDot } from "../keywords";
import { getRuntimeConfig } from "../runtimeConfig";
import { JoinRowTodo, Todo } from "../Todo";
import { ensureRectangularArraySizes } from "../unnest";
import { cleanSql, partition, zeroTo } from "../utils";
import { buildRawQuery } from "./buildRawQuery";
import { Driver } from "./Driver";
import { DeleteOp, generateOps, InsertOp, OpColumn, UpdateOp } from "./EntityWriter";
import { IdAssigner, SequenceIdAssigner } from "./IdAssigner";

export interface PostgresDriverOpts {
  idAssigner?: IdAssigner;
  /** Sets a default `PreloadPlugin` for any `EntityManager` that uses this driver. */
  preloadPlugin?: PreloadPlugin;
}

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
export class PostgresDriver implements Driver<TransactionSql> {
  readonly #idAssigner: IdAssigner;
  readonly #preloadPlugin: PreloadPlugin | undefined;

  constructor(
    private readonly sql: Sql,
    opts?: PostgresDriverOpts,
  ) {
    this.#idAssigner = opts?.idAssigner ?? new SequenceIdAssigner((s) => sql.unsafe(s));
    this.#preloadPlugin = opts?.preloadPlugin;
  }

  async executeFind(
    em: EntityManager,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): Promise<any[]> {
    const { sql, bindings } = buildRawQuery(parsed, { limit: em.entityLimit, ...settings });
    return this.executeQuery(em, sql, bindings as any[]);
  }

  async executeQuery(em: EntityManager, sql: string, bindings: any[]): Promise<any[]> {
    return convertToSql(this.getMaybeInTxnKnex(em), sql, bindings).catch(function executeQuery(err) {
      throw appendStack(err, new Error());
    });
  }

  async transaction<T>(em: EntityManager, fn: (txn: TransactionSql) => Promise<T>): Promise<T> {
    // `em.transaction` might have already opened a transaction
    if (em.txn) {
      return fn(em.txn as TransactionSql);
    }
    // Get a connection from the pool and run the transaction. We use this sql.reserve() API instead
    // of sql.begin so that we can call driverBeforeBegin/AfterCommit with the same connection as
    // the transaction itself.
    const sql = await this.sql.reserve();
    const txn = (em.txn = sql as any as TransactionSql);
    let result: any;
    try {
      await driverBeforeBegin(em, txn);
      await sql`begin`;
      await driverAfterBegin(em, txn);
      result = await fn(txn);
      await driverBeforeCommit(em, txn);
      await sql`commit`;
      await driverAfterCommit(em, txn);
      return result;
    } catch (e) {
      // Probably need more logging here...
      try {
        await sql`rollback`;
      } catch (e) {}
      throw e;
    } finally {
      em.txn = undefined;
      sql.release();
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
    const txn = (em.txn ?? fail("Expected EntityManager.txn to be set")) as TransactionSql;
    await this.#idAssigner.assignNewIds(entityTodos);
    const ops = generateOps(entityTodos);
    // Do INSERTs+UPDATEs first so that we avoid DELETE cascades invalidating oplocks
    // See https://github.com/joist-orm/joist-orm/issues/591
    await Promise.all([
      ...ops.inserts.map((op) => batchInsert(txn, op)),
      ...ops.updates.map((op) => batchUpdate(txn, op)),
      ...ops.deletes.map((op) => batchDelete(txn, op)),
      ...Object.entries(joinRows).flatMap(([joinTableName, { m2m, newRows, deletedRows }]) => {
        return [m2mBatchInsert(txn, joinTableName, m2m, newRows), m2mBatchDelete(txn, joinTableName, m2m, deletedRows)];
      }),
    ]);
  }

  get defaultPlugins() {
    return { preloadPlugin: this.#preloadPlugin };
  }

  private getMaybeInTxnKnex(em: EntityManager): Sql | TransactionSql {
    return (em.txn || this.sql) as Sql | TransactionSql;
  }
}

async function batchInsert(txn: TransactionSql, op: InsertOp): Promise<unknown> {
  const { tableName, columns, columnValues } = op;
  const [cte, bindings] = buildUnnestCte("data", columns, columnValues);
  const sql = cleanSql(`
    ${cte}
    INSERT INTO ${kq(tableName)} (${columns.map((c) => kq(c.columnName)).join(", ")})
    SELECT * FROM data
  `);
  return convertToSql(txn, sql, bindings).catch(function batchInsert(err) {
    throw appendStack(err, new Error());
  });
}

async function batchUpdate(txn: TransactionSql, op: UpdateOp): Promise<void> {
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

  const results = await convertToSql(txn, cleanSql(sql), bindings).catch(function batchUpdate(err) {
    throw appendStack(err, new Error());
  });

  const ids = columnValues[0]; // assume id is the 1st column
  if (results.length !== ids.length) {
    const updated = new Set(results.map((r: any) => r.id));
    const missing = ids.filter((id) => !updated.has(id));
    throw new Error(`Oplock failure for ${tableName} rows ${missing.join(", ")}`);
  }
}

async function batchDelete(txn: TransactionSql, op: DeleteOp): Promise<void> {
  const { tableName, ids } = op;
  await txn`DELETE FROM ${txn(tableName)} WHERE id IN ${txn(ids)}`;
}

// Match $0 which we'll replace with $1, $2, etc.
const param = /\$0/g;

/** Converts our `$0` params to $1, $2, etc. */
function convertToSql(sql: Sql | TransactionSql, query: string, bindings: any[]): PendingQuery<any> {
  let count = 0;
  const _sql = query.replace(param, () => `$${++count}`);
  return sql.unsafe(_sql, bindings, { prepare: true });
}

/** Creates a CTE named `tableName` that bulk-injects the `columnValues` into a SQL query. */
function buildUnnestCte(tableName: string, columns: OpColumn[], columnValues: any[][]): [string, any[][]] {
  ensureRectangularArraySizes(columns, columnValues);
  const selects = columns.map((c) => {
    if (c.dbType.endsWith("[]")) {
      if (c.isNullableArray) {
        return `unnest_arrays($0::${c.dbType}[], true) as ${kq(c.columnName)}`;
      } else {
        return `unnest_arrays($0::${c.dbType}[]) as ${kq(c.columnName)}`;
      }
    } else {
      return `unnest($0::${c.dbType}[]) as ${kq(c.columnName)}`;
    }
  });
  const sql = `WITH ${tableName} AS (SELECT ${selects.join(", ")})`;
  return [sql, columnValues];
}

async function m2mBatchInsert(txn: TransactionSql, joinTableName: string, m2m: ManyToManyLike, newRows: JoinRow[]) {
  if (newRows.length === 0) return;
  // const [cte, bindings] = buildUnnestCte("data", columns, columnValues);
  const sql = cleanSql(`
    INSERT INTO ${kq(joinTableName)} (${kq(m2m.columnName)}, ${kq(m2m.otherColumnName)})
    VALUES ${zeroTo(newRows.length)
      .map(() => "($0, $0) ")
      .join(", ")}
    ON CONFLICT (${kq(m2m.columnName)}, ${kq(m2m.otherColumnName)}) DO UPDATE SET id = ${kq(joinTableName)}.id
    RETURNING id;
  `);
  const meta1 = getMetadata(m2m.entity);
  const meta2 = m2m.otherMeta;
  const bindings = newRows.flatMap((row) => {
    return [
      keyToNumber(meta1, row.columns[m2m.columnName].idTagged),
      keyToNumber(meta2, row.columns[m2m.otherColumnName].idTagged),
    ];
  });
  const rows = await convertToSql(txn, sql, bindings).catch(function m2mBatchInsert(err) {
    throw appendStack(err, new Error());
  });
  for (let i = 0; i < rows.length; i++) {
    newRows[i].id = rows[i].id;
    newRows[i].op = JoinRowOperation.Flushed;
  }
}

async function m2mBatchDelete(txn: TransactionSql, joinTableName: string, m2m: ManyToManyLike, deletedRows: JoinRow[]) {
  if (deletedRows.length === 0) return;
  // `remove`s that were done against unloaded ManyToManyCollections will not have row ids
  const [haveIds, noIds] = partition(deletedRows, (r) => r.id !== -1);
  if (haveIds.length > 0) {
    await txn`DELETE FROM ${txn(joinTableName)} WHERE id IN ${txn(haveIds.map((r) => r.id!))}`;
  }
  if (noIds.length > 0) {
    const data = noIds
      // Watch for m2m rows that got added-then-removed to entities that were themselves added-then-removed,
      // as the deTagId will be undefined for those, as we're skipping adding them to the database.
      .filter((row) => {
        const e1 = row.columns[m2m.columnName];
        const e2 = row.columns[m2m.columnName];
        return !e1.isNewEntity && !e2.isNewEntity;
      })
      .map(
        (e) =>
          [
            keyToNumber(m2m.meta, e.columns[m2m.columnName].idTagged),
            keyToNumber(m2m.otherMeta, e.columns[m2m.otherColumnName].idTagged),
          ] as any,
      );
    if (data.length > 0) {
      await txn`
        DELETE FROM ${txn(joinTableName)}
        WHERE (${txn(m2m.columnName)}, ${txn(m2m.otherColumnName)}) IN (
          SELECT (data->>0)::int, (data->>1)::int FROM jsonb_array_elements(${data}) data
        )`;
    }
  }
  deletedRows.forEach((row) => {
    row.id = undefined;
    row.op = JoinRowOperation.Flushed;
  });
}

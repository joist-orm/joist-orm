import { sql, SQL, type TransactionSQL } from "bun";
import {
  afterTransactionCommit,
  afterTransactionStart,
  beforeTransactionCommit,
  beforeTransactionStart,
  Driver,
  EntityManager,
  fail,
  IdAssigner,
  kq,
  kqDot,
  ParsedFindQuery,
  SequenceIdAssigner,
} from "joist-orm";
import { JoinRowTodo, Todo } from "joist-orm/build/Todo";
import { buildValuesCte } from "joist-orm/build/dataloaders/findDataLoader";
import { DeleteOp, generateOps, InsertOp, UpdateOp } from "joist-orm/build/drivers/EntityWriter";
import { getRuntimeConfig } from "joist-orm/build/runtimeConfig";
import { batched, cleanSql } from "joist-orm/build/utils";

export class BunPgDriver implements Driver<TransactionSQL> {
  readonly #idAssigner: IdAssigner;
  readonly #sql: SQL;

  constructor(_sql: SQL = sql) {
    this.#sql = _sql;
    this.#idAssigner = new SequenceIdAssigner((s) => this.#sql(s));
  }

  executeFind(
    em: EntityManager,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): Promise<any[]> {
    throw new Error("Method not implemented.");
  }

  executeQuery(em: EntityManager, sql: string, bindings: any[]): Promise<any[]> {
    throw new Error("Method not implemented.");
  }

  async transaction<T>(em: EntityManager, fn: (txn: TransactionSQL) => Promise<T>): Promise<T> {
    if (em.txn) {
      return fn(em.txn as TransactionSQL);
    } else {
      await beforeTransactionStart(em, this.#sql);
      const result = await this.#sql.begin(async (txn) => {
        em.txn = txn;
        try {
          await afterTransactionStart(em, txn);
          const result = await fn(txn);
          await beforeTransactionCommit(em, txn);
          return result;
        } finally {
          em.txn = undefined;
        }
      });
      await afterTransactionCommit(em, this.#sql);
      return result;
    }
  }

  assignNewIds(em: EntityManager, todos: Record<string, Todo>): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async flushEntities(em: EntityManager, todos: Record<string, Todo>): Promise<void> {
    const sql = (em.txn ?? fail("Expected EntityManager.txn to be set")) as TransactionSQL;
    await this.#idAssigner.assignNewIds(todos);

    const ops = generateOps(todos);

    // Do INSERTs+UPDATEs first so that we avoid DELETE cascades invalidating oplocks
    // See https://github.com/joist-orm/joist-orm/issues/591
    // We want 10k params maximum per batch insert
    const parameterLimit = 10_000;
    for (const insert of ops.inserts) {
      const parameterTotal = insert.columns.length * insert.rows.length;
      if (parameterTotal > parameterLimit) {
        const batchSize = Math.floor(parameterLimit / insert.columns.length);
        await Promise.all(batched(insert.rows, batchSize).map((batch) => batchInsert(sql, { ...insert, rows: batch })));
      } else {
        await batchInsert(sql, insert);
      }
    }

    for (const update of ops.updates) {
      const parameterTotal = update.columns.length * update.rows.length;
      if (parameterTotal > parameterLimit) {
        const batchSize = Math.floor(parameterLimit / update.columns.length);
        await Promise.all(batched(update.rows, batchSize).map((batch) => batchUpdate(sql, { ...update, rows: batch })));
      } else {
        await batchUpdate(sql, update);
      }
    }

    for (const del of ops.deletes) {
      await batchDelete(sql, del);
    }
  }

  flushJoinTables(em: EntityManager, joinRows: Record<string, JoinRowTodo>): Promise<void> {
    throw new Error("Method not implemented.");
  }

  get defaultPlugins() {
    return {};
  }
}

// Issue 1 INSERT statement with N `VALUES (..., ...), (..., ...), ...`
function batchInsert(txn: TransactionSQL, op: InsertOp): Promise<unknown> {
  const { tableName, columns, rows } = op;
  const sql = cleanSql(`
    INSERT INTO ${kq(tableName)} (${columns.map((c) => kq(c.columnName)).join(", ")})
    VALUES ${rows.map((_, i) => `(${columns.map((_, j) => `\$${i * columns.length + j + 1}`).join(", ")})`).join(",")}
  `);
  const params = rows.flat();
  return txn.unsafe(sql, params);
}

// Issue 1 UPDATE statement with N `VALUES (..., ...), (..., ...), ...`
async function batchUpdate(txn: TransactionSQL, op: UpdateOp): Promise<void> {
  const { tableName, columns, rows, updatedAt } = op;

  const cte = buildValuesCte("data", columns, rows);

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

  const bindings = rows.flat();
  const result = await txn(cleanSql(sql) as any, bindings);

  if (result.rows.length !== rows.length) {
    const updated = new Set(result.rows.map((r: any) => r.id));
    const missing = rows.map((r) => r[0]).filter((id) => !updated.has(id));
    throw new Error(`Oplock failure for ${tableName} rows ${missing.join(", ")}`);
  }
}

async function batchDelete(txn: TransactionSQL, op: DeleteOp): Promise<void> {
  const { tableName, ids } = op;
  // await txn(tableName).del().whereIn("id", ids);
}

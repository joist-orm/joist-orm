import { sql, SQL, type SQLQuery, type TransactionSQL } from "bun";
import {
  afterTransaction,
  beforeTransaction,
  buildUnnestCte,
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
import { DeleteOp, generateOps, InsertOp, UpdateOp } from "joist-orm/build/drivers/EntityWriter";
import { getRuntimeConfig } from "joist-orm/build/runtimeConfig";
import { cleanSql } from "joist-orm/build/utils";

export class BunPgDriver implements Driver<TransactionSQL> {
  readonly #idAssigner: IdAssigner;
  readonly #sql: SQL;

  constructor(_sql: SQL = sql) {
    this.#sql = _sql;
    this.#idAssigner = new SequenceIdAssigner((s) => this.#sql.unsafe(s));
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

  transaction<T>(em: EntityManager, fn: (txn: TransactionSQL) => Promise<T>): Promise<T> {
    if (em.txn) {
      return fn(em.txn as TransactionSQL);
    } else {
      return this.#sql.begin(async (txn) => {
        em.txn = txn;
        try {
          await beforeTransaction(em, txn);
          const result = await fn(txn);
          await afterTransaction(em, txn);
          return result;
        } finally {
          em.txn = undefined;
        }
      });
    }
  }

  assignNewIds(em: EntityManager, todos: Record<string, Todo>): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async flush(em: EntityManager, todos: Record<string, Todo>, joinRows: Record<string, JoinRowTodo>): Promise<void> {
    const sql = (em.txn ?? fail("Expected EntityManager.txn to be set")) as TransactionSQL;
    await this.#idAssigner.assignNewIds(todos);
    const ops = generateOps(todos);
    // Do INSERTs+UPDATEs first so that we avoid DELETE cascades invalidating oplocks
    // See https://github.com/joist-orm/joist-orm/issues/591
    await Promise.all([
      ...ops.inserts.map((op) => batchInsert(sql, op)),
      ...ops.updates.map((op) => batchUpdate(sql, op)),
      ...ops.deletes.map((op) => batchDelete(sql, op)),
    ]);
  }

  get defaultPlugins() {
    return {};
  }
}

function batchInsert(txn: TransactionSQL, op: InsertOp): Promise<unknown> {
  const { tableName, columns, columnValues } = op;
  const [cte, bindings] = buildUnnestCte("data", columns, columnValues);
  const sql = cleanSql(`
    ${cte}
    INSERT INTO ${kq(tableName)} (${columns.map((c) => kq(c.columnName)).join(", ")})
    SELECT * FROM data
  `);
  return convertToSql(txn, sql, bindings);
}

async function batchUpdate(txn: TransactionSQL, op: UpdateOp): Promise<void> {
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

  const results = await convertToSql(txn, sql, bindings);

  const ids = columnValues[0]; // assume id is the 1st column
  if (results.length !== ids.length) {
    const updated = new Set(results.map((r: any) => r.id));
    const missing = ids.filter((id) => !updated.has(id));
    throw new Error(`Oplock failure for ${tableName} rows ${missing.join(", ")}`);
  }
}

async function batchDelete(txn: TransactionSQL, op: DeleteOp): Promise<void> {
  const { tableName, ids } = op;
  // await txn(tableName).del().whereIn("id", ids);
}

function convertToSql(sql: TransactionSQL, query: string, bindings: any[]): SQLQuery {
  // Split the query string by the placeholder character '?'
  const fragments = query.split("?");
  if (fragments.length - 1 !== bindings.length) {
    throw new Error(`Mismatch between placeholders (${fragments.length - 1}) and bindings (${bindings.length})`);
  }
  // postgres.js does runtime detection of the `raw` property to determine if it's a template string
  const templateStrings = Object.assign(fragments, {
    raw: fragments,
  }) as unknown as TemplateStringsArray;
  return sql(templateStrings, ...bindings);
}

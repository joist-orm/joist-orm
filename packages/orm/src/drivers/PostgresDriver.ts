import { PendingQuery, Sql, TransactionSql } from "postgres";
import { buildValuesCte } from "../dataloaders/findDataLoader";
import {
  afterTransaction,
  appendStack,
  beforeTransaction,
  deTagId,
  EntityManager,
  fail,
  getMetadata,
  keyToNumber,
  maybeResolveReferenceToId,
  ParsedFindQuery,
} from "../index";
import { JoinRowOperation } from "../JoinRows";
import { kq, kqDot } from "../keywords";
import { getRuntimeConfig } from "../runtimeConfig";
import { JoinRowTodo, Todo } from "../Todo";
import { batched, cleanSql, partition, zeroTo } from "../utils";
import { buildRawQuery } from "./buildRawQuery";
import { Driver } from "./Driver";
import { DeleteOp, generateOps, InsertOp, UpdateOp } from "./EntityWriter";
import { IdAssigner, SequenceIdAssigner } from "./IdAssigner";

export interface PostgresDriverOpts {
  idAssigner?: IdAssigner;
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
  private readonly idAssigner: IdAssigner;

  constructor(
    private readonly sql: Sql,
    opts?: PostgresDriverOpts,
  ) {
    this.idAssigner = opts?.idAssigner ?? new SequenceIdAssigner((s) => sql.unsafe(s));
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

  transaction<T>(em: EntityManager, fn: (txn: TransactionSql) => Promise<T>): Promise<T> {
    // `em.transaction` might have already opened a transaction
    if (em.txn) {
      return fn(em.txn as TransactionSql);
    }
    return this.sql.begin(async (txn) => {
      em.txn = txn;
      try {
        await beforeTransaction(em, txn);
        const result = await fn(txn);
        await afterTransaction(em, txn);
        return result;
      } finally {
        em.txn = undefined;
      }
    }) as Promise<T>;
  }

  async assignNewIds(_: EntityManager, todos: Record<string, Todo>): Promise<void> {
    return this.idAssigner.assignNewIds(todos);
  }

  async flushEntities(em: EntityManager, todos: Record<string, Todo>): Promise<void> {
    const txn = (em.txn ?? fail("Expected EntityManager.txn to be set")) as TransactionSql;
    await this.idAssigner.assignNewIds(todos);

    const ops = generateOps(todos);

    // Do INSERTs+UPDATEs first so that we avoid DELETE cascades invalidating oplocks
    // See https://github.com/joist-orm/joist-orm/issues/591
    // We want 10k params maximum per batch insert
    const parameterLimit = 10_000;
    for (const insert of ops.inserts) {
      const parameterTotal = insert.columns.length * insert.rows.length;
      if (parameterTotal > parameterLimit) {
        const batchSize = Math.floor(parameterLimit / insert.columns.length);
        await Promise.all(batched(insert.rows, batchSize).map((batch) => batchInsert(txn, { ...insert, rows: batch })));
      } else {
        await batchInsert(txn, insert);
      }
    }

    for (const update of ops.updates) {
      const parameterTotal = update.columns.length * update.rows.length;
      if (parameterTotal > parameterLimit) {
        const batchSize = Math.floor(parameterLimit / update.columns.length);
        await Promise.all(batched(update.rows, batchSize).map((batch) => batchUpdate(txn, { ...update, rows: batch })));
      } else {
        await batchUpdate(txn, update);
      }
    }

    for (const del of ops.deletes) {
      await batchDelete(txn, del);
    }
  }

  async flushJoinTables(em: EntityManager, joinRows: Record<string, JoinRowTodo>): Promise<void> {
    const txn = (em.txn ?? fail("Expected EntityManager.txn to be set")) as TransactionSql;
    for (const [joinTableName, { m2m, newRows, deletedRows }] of Object.entries(joinRows)) {
      if (newRows.length > 0) {
        const sql = cleanSql(`
          INSERT INTO ${joinTableName} (${m2m.columnName}, ${m2m.otherColumnName})
          VALUES ${zeroTo(newRows.length)
            .map(() => "(?, ?) ")
            .join(", ")}
          ON CONFLICT (${m2m.columnName}, ${m2m.otherColumnName}) DO UPDATE SET id = ${joinTableName}.id
          RETURNING id;
        `);
        const meta1 = getMetadata(m2m.entity);
        const meta2 = m2m.otherMeta;
        const bindings = newRows.flatMap((row) => {
          return [
            keyToNumber(meta1, maybeResolveReferenceToId(row[m2m.columnName] as any))!,
            keyToNumber(meta2, maybeResolveReferenceToId(row[m2m.otherColumnName] as any))!,
          ];
        });
        const rows = await convertToSql(txn, sql, bindings);
        for (let i = 0; i < rows.length; i++) {
          newRows[i].id = rows[i].id;
          newRows[i].op = JoinRowOperation.Flushed;
        }
      }
      if (deletedRows.length > 0) {
        // `remove`s that were done against unloaded ManyToManyCollections will not have row ids
        const [haveIds, noIds] = partition(deletedRows, (r) => r.id !== -1);

        if (haveIds.length > 0) {
          await txn`DELETE FROM ${txn(joinTableName)} WHERE id IN ${txn(haveIds.map((r) => r.id!))}`;
        }

        if (noIds.length > 0) {
          const data = noIds
            .map(
              (e) =>
                [
                  deTagId(m2m.meta, maybeResolveReferenceToId(e[m2m.columnName] as any)!),
                  deTagId(m2m.otherMeta, maybeResolveReferenceToId(e[m2m.otherColumnName] as any)!),
                ] as any,
            )
            // Watch for m2m rows that got added-then-removed to entities that were themselves added-then-removed,
            // as the deTagId will be undefined for those, as we're skipping adding them to the database.
            .filter(([id1, id2]) => id1 !== undefined && id2 !== undefined);
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
    }
  }

  private getMaybeInTxnKnex(em: EntityManager): Sql | TransactionSql {
    return (em.txn || this.sql) as Sql | TransactionSql;
  }
}

// Issue 1 INSERT statement with N `VALUES (..., ...), (..., ...), ...`
function batchInsert(txn: TransactionSql, op: InsertOp): Promise<unknown> {
  const { tableName, columns, rows } = op;
  const sql = cleanSql(`
    INSERT INTO "${tableName}" (${columns.map((c) => `"${c.columnName}"`).join(", ")})
    VALUES ${rows.map(() => `(${columns.map(() => `?`).join(", ")})`).join(",")}
  `);
  const bindings = rows.flat();
  return convertToSql(txn, sql, bindings);
}

// Issue 1 UPDATE statement with N `VALUES (..., ...), (..., ...), ...`
async function batchUpdate(txn: TransactionSql, op: UpdateOp): Promise<void> {
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
  const results = await convertToSql(txn, cleanSql(sql), bindings);

  if (results.length !== rows.length) {
    const updated = new Set(results.map((r: any) => r.id));
    const missing = rows.map((r) => r[0]).filter((id) => !updated.has(id));
    throw new Error(`Oplock failure for ${tableName} rows ${missing.join(", ")}`);
  }
}

async function batchDelete(txn: TransactionSql, op: DeleteOp): Promise<void> {
  const { tableName, ids } = op;
  await txn`DELETE FROM ${txn(tableName)} WHERE id IN ${txn(ids)}`;
}

/**
 * Interleaves a SQL query with placeholders (?) and bindings for template literal use
 *
 * @param sql - the postgres.js Sql instance
 * @param query - SQL query string with ? placeholders
 * @param bindings - Array of values to bind to the placeholders
 * @returns An array with string fragments and binding values interleaved
 */
function convertToSql(sql: Sql, query: string, bindings: any[]): PendingQuery<any> {
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

import { Knex } from "knex";
import { buildValuesCte } from "../dataloaders/findDataLoader";
import {
  afterTransaction,
  beforeTransaction,
  deTagId,
  EntityManager,
  getMetadata,
  keyToNumber,
  maybeResolveReferenceToId,
  ParsedFindQuery,
} from "../index";
import { JoinRowOperation } from "../JoinRows";
import { kq, kqDot } from "../keywords";
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
export class PostgresDriver implements Driver {
  private readonly idAssigner: IdAssigner;

  constructor(
    private readonly knex: Knex,
    opts?: PostgresDriverOpts,
  ) {
    this.idAssigner = opts?.idAssigner ?? new SequenceIdAssigner();
  }

  async executeFind(
    em: EntityManager,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): Promise<any[]> {
    const { sql, bindings } = buildRawQuery(parsed, { limit: em.entityLimit, ...settings });
    // console.log(sql);
    // console.log(bindings);
    // Still go through knex to use the connection pool
    const knex = this.getMaybeInTxnKnex(em);
    const result = await knex.raw(sql, bindings);
    return result.rows;
  }

  async executeQuery(em: EntityManager<unknown>, sql: string, bindings: any[]): Promise<any[]> {
    const knex = this.getMaybeInTxnKnex(em);
    const result = await knex.raw(sql, bindings);
    return result.rows;
  }

  async transaction<T>(
    em: EntityManager,
    fn: (txn: Knex.Transaction) => Promise<T>,
    isolationLevel?: "serializable",
  ): Promise<T> {
    const knex = this.getMaybeInTxnKnex(em);
    const alreadyInTxn = "commit" in knex;
    if (alreadyInTxn) {
      return fn(knex as Knex.Transaction);
    }
    return await knex.transaction(async (txn) => {
      em.currentTxnKnex = txn;
      try {
        if (isolationLevel) {
          await txn.raw("set transaction isolation level serializable;");
        }
        await beforeTransaction(em, txn);
        const result = await fn(txn);
        await afterTransaction(em, txn);
        return result;
      } finally {
        em.currentTxnKnex = undefined;
      }
    });
  }

  async assignNewIds(em: EntityManager, todos: Record<string, Todo>): Promise<void> {
    const knex = this.getMaybeInTxnKnex(em);
    return this.idAssigner.assignNewIds(knex, todos);
  }

  async flushEntities(em: EntityManager, todos: Record<string, Todo>): Promise<void> {
    const knex = this.getMaybeInTxnKnex(em);
    await this.idAssigner.assignNewIds(knex, todos);

    const ops = generateOps(todos);

    // Do INSERTs+UPDATEs first so that we avoid DELETE cascades invalidating oplocks
    // See https://github.com/joist-orm/joist-orm/issues/591
    // We want 10k params maximum per batch insert
    const parameterLimit = 10_000;
    for (const insert of ops.inserts) {
      const parameterTotal = insert.columns.length * insert.rows.length;
      if (parameterTotal > parameterLimit) {
        const batchSize = Math.floor(parameterLimit / insert.columns.length);
        await Promise.all(
          batched(insert.rows, batchSize).map((batch) => batchInsert(knex, { ...insert, rows: batch })),
        );
      } else {
        await batchInsert(knex, insert);
      }
    }

    for (const update of ops.updates) {
      const parameterTotal = update.columns.length * update.rows.length;
      if (parameterTotal > parameterLimit) {
        const batchSize = Math.floor(parameterLimit / update.columns.length);
        await Promise.all(
          batched(update.rows, batchSize).map((batch) => batchUpdate(knex, { ...update, rows: batch })),
        );
      } else {
        await batchUpdate(knex, update);
      }
    }

    for (const del of ops.deletes) {
      await batchDelete(knex, del);
    }
  }

  async flushJoinTables(em: EntityManager, joinRows: Record<string, JoinRowTodo>): Promise<void> {
    const knex = this.getMaybeInTxnKnex(em);
    for await (const [joinTableName, { m2m, newRows, deletedRows }] of Object.entries(joinRows)) {
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
        const { rows } = await knex.raw(sql, bindings);
        for (let i = 0; i < rows.length; i++) {
          newRows[i].id = rows[i].id;
          newRows[i].op = JoinRowOperation.Flushed;
        }
      }
      if (deletedRows.length > 0) {
        // `remove`s that were done against unloaded ManyToManyCollections will not have row ids
        const [haveIds, noIds] = partition(deletedRows, (r) => r.id !== -1);

        if (haveIds.length > 0) {
          await knex(joinTableName)
            .del()
            .whereIn(
              "id",
              haveIds.map((e) => e.id!),
            );
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
            await knex(joinTableName).del().whereIn([m2m.columnName, m2m.otherColumnName], data);
          }
        }

        deletedRows.forEach((row) => {
          row.id = undefined;
          row.op = JoinRowOperation.Flushed;
        });
      }
    }
  }

  private getMaybeInTxnKnex(em: EntityManager): Knex {
    return em.currentTxnKnex || this.knex;
  }
}

// Issue 1 INSERT statement with N `VALUES (..., ...), (..., ...), ...`
function batchInsert(knex: Knex, op: InsertOp): Promise<unknown> {
  const { tableName, columns, rows } = op;
  const sql = cleanSql(`
    INSERT INTO "${tableName}" (${columns.map((c) => `"${c.columnName}"`).join(", ")})
    VALUES ${rows.map(() => `(${columns.map(() => `?`).join(", ")})`).join(",")}
  `);
  const bindings = rows.flat();
  return knex.raw(sql, bindings);
}

// Issue 1 UPDATE statement with N `VALUES (..., ...), (..., ...), ...`
async function batchUpdate(knex: Knex, op: UpdateOp): Promise<void> {
  const { tableName, columns, rows, updatedAt } = op;

  const cte = buildValuesCte("data", columns, rows);

  const maybeUpdatedAt = updatedAt
    ? ` AND date_trunc('milliseconds', ${kqDot(tableName, updatedAt!)}) = data.__original_updated_at`
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
  const result = await knex.raw(cleanSql(sql), bindings);

  if (result.rows.length !== rows.length) {
    const updated = new Set(result.rows.map((r: any) => r.id));
    const missing = rows.map((r) => r[0]).filter((id) => !updated.has(id));
    throw new Error(`Oplock failure for ${tableName} rows ${missing.join(", ")}`);
  }
}

async function batchDelete(knex: Knex, op: DeleteOp): Promise<void> {
  const { tableName, ids } = op;
  await knex(tableName).del().whereIn("id", ids);
}

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
  getMetadata,
  getRuntimeConfig,
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
  RuntimeConfig,
  SequenceIdAssigner,
  Todo,
  UpdateOp,
  zeroTo,
} from "joist-orm";
import { Knex } from "knex";
import pg from "pg";
import { builtins, getTypeParser } from "pg-types";
import array from "postgres-array";

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
export class PostgresDriver implements Driver<Knex.Transaction> {
  readonly #idAssigner: IdAssigner;
  readonly #preloadPlugin: PreloadPlugin | undefined;

  constructor(
    private readonly knex: Knex,
    opts?: PostgresDriverOpts,
  ) {
    this.#idAssigner = opts?.idAssigner ?? new SequenceIdAssigner(knex);
    this.#preloadPlugin = opts?.preloadPlugin;
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

  async executeQuery(em: EntityManager, sql: string, bindings: readonly any[]): Promise<any[]> {
    // Still go through knex to use the connection pool
    return this.getMaybeInTxnKnex(em)
      .raw(sql, bindings)
      .then((result) => result.rows);
  }

  async transaction<T>(em: EntityManager, fn: (txn: Knex.Transaction) => Promise<T>): Promise<T> {
    // `em.transaction` might have already opened a transaction
    if (em.txn) {
      return fn(em.txn as Knex.Transaction);
    }
    await driverBeforeBegin(em, this.knex);
    const result = await this.knex.transaction(async (txn) => {
      em.txn = txn;
      try {
        await driverAfterBegin(em, txn);
        const result = await fn(txn);
        await driverBeforeCommit(em, txn);
        return result;
      } finally {
        em.txn = undefined;
      }
    });
    await driverAfterCommit(em, this.knex);
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
    const txn = (em.txn ?? fail("Expected EntityManager.txn to be set")) as Knex.Transaction;
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

  private getMaybeInTxnKnex(em: EntityManager): Knex {
    return (em.txn || this.knex) as Knex.Transaction;
  }
}

async function batchInsert(txn: Knex.Transaction, op: InsertOp): Promise<unknown> {
  const { tableName, columns, columnValues } = op;
  const [cte, bindings] = buildUnnestCte("data", columns, columnValues);
  const sql = cleanSql(`
    ${cte}
    INSERT INTO ${kq(tableName)} (${columns.map((c) => kq(c.columnName)).join(", ")})
    SELECT * FROM data
  `);
  return txn.raw(sql, bindings);
}

async function batchUpdate(txn: Knex.Transaction, op: UpdateOp): Promise<void> {
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

  const result = await txn.raw(cleanSql(sql), bindings);
  const results = result.rows;

  const ids = columnValues[0]; // assume id is the 1st column
  if (results.length !== ids.length) {
    const updated = new Set(results.map((r: any) => r.id));
    const missing = ids.filter((id) => !updated.has(id));
    throw new Error(`Oplock failure for ${tableName} rows ${missing.join(", ")}`);
  }
}

async function batchDelete(txn: Knex.Transaction, op: DeleteOp): Promise<void> {
  const { tableName, ids } = op;
  await txn.raw(`DELETE FROM ${kq(tableName)} WHERE id = ANY(?)`, [ids]);
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

async function m2mBatchInsert(txn: Knex.Transaction, joinTableName: string, m2m: ManyToManyLike, newRows: JoinRow[]) {
  if (newRows.length === 0) return;
  const sql = cleanSql(`
    INSERT INTO ${kq(joinTableName)} (${kq(m2m.columnName)}, ${kq(m2m.otherColumnName)})
    VALUES ${zeroTo(newRows.length)
      .map(() => "(?, ?) ")
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
  const { rows } = await txn.raw(sql, bindings);
  for (let i = 0; i < rows.length; i++) {
    newRows[i].id = rows[i].id;
    newRows[i].op = JoinRowOperation.Flushed;
  }
}

async function m2mBatchDelete(
  txn: Knex.Transaction,
  joinTableName: string,
  m2m: ManyToManyLike,
  deletedRows: JoinRow[],
) {
  if (deletedRows.length === 0) return;
  // `remove`s that were done against unloaded ManyToManyCollections will not have row ids
  const [haveIds, noIds] = partition(deletedRows, (r) => r.id !== -1);
  if (haveIds.length > 0) {
    await txn.raw(`DELETE FROM ${kq(joinTableName)} WHERE id = ANY(?)`, [haveIds.map((r) => r.id!)]);
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
      await txn.raw(
        `
        DELETE FROM ${kq(joinTableName)}
        WHERE (${kq(m2m.columnName)}, ${kq(m2m.otherColumnName)}) IN (
          SELECT (data->>0)::int, (data->>1)::int FROM jsonb_array_elements(?) data
        )`,
        [JSON.stringify(data)],
      );
    }
  }
  deletedRows.forEach((row) => {
    row.id = undefined;
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

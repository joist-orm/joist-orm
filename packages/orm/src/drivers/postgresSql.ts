import {
  type DeleteOp,
  type DriverQueryResult,
  type InsertOp,
  JoinRowOperation,
  type JoinRowTodo,
  type OpColumn,
  type Todo,
  type UpdateOp,
  cleanSql,
  ensureRectangularArraySizes,
  generateOps,
  getRuntimeConfig,
  kq,
  kqDot,
  partition,
} from "joist-core";

/** A SQL execution boundary, independent of either driver's connection API. */
type QueryRunner = (sql: string, bindings: readonly unknown[]) => Promise<DriverQueryResult>;

/**
 * Flushes already-ID-assigned entities using PostgreSQL bulk SQL and optimistic locks.
 *
 * Deferred foreign keys allow bulk inserts without topographic ordering. The caller owns
 * ID assignment, transactions and query observation; this module only issues numbered SQL.
 */
export async function flushPostgres(
  query: QueryRunner,
  entityTodos: Record<string, Todo>,
  joinRows: Record<string, JoinRowTodo>,
): Promise<void> {
  const ops = generateOps(entityTodos);
  // Do INSERTs+UPDATEs first so that we avoid DELETE cascades invalidating oplocks
  // See https://github.com/joist-orm/joist-orm/issues/591
  await Promise.all([
    ...ops.inserts.map((op) => batchInsert(query, op)),
    ...ops.updates.map((op) => batchUpdate(query, op)),
    ...ops.deletes.map((op) => batchDelete(query, op)),
    ...Object.entries(joinRows).flatMap(([joinTableName, todo]) => [
      m2mBatchInsert(query, joinTableName, todo),
      m2mBatchDelete(query, joinTableName, todo),
    ]),
  ]);
}

/** Inserts a rectangular batch through a typed unnest CTE. */
async function batchInsert(query: QueryRunner, op: InsertOp): Promise<unknown> {
  const { tableName, columns, columnValues } = op;
  const [cte, bindings] = buildUnnestCte("data", columns, columnValues);
  const sql = cleanSql(`
    ${cte}
    INSERT INTO ${kq(tableName)} (${columns.map((c) => kq(c.columnName)).join(", ")})
    SELECT * FROM data
  `);
  const pgSql = toPgParams(sql);
  return query(pgSql, bindings);
}

/**
 * Updates a batch and rejects rows whose optimistic lock no longer matches.
 *
 * The returned IDs must cover the entire batch; missing rows indicate a concurrent change.
 */
async function batchUpdate(query: QueryRunner, op: UpdateOp): Promise<void> {
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
  const result = await query(pgSql, bindings);
  const results = result.rows;

  const ids = columnValues[0]; // assume id is the 1st column
  if (results.length !== ids.length) {
    const updated = new Set(results.map((r: any) => r.id));
    const missing = ids.filter((id) => !updated.has(id));
    throw new Error(`Oplock failure for ${tableName} rows ${missing.join(", ")}`);
  }
}

/** Deletes a batch by its database identifiers. */
async function batchDelete(query: QueryRunner, op: DeleteOp): Promise<void> {
  const { tableName, ids } = op;
  const pgSql = toPgParams(`DELETE FROM ${kq(tableName)} WHERE id = ANY(?)`);
  await query(pgSql, [ids]);
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

/**
 * Inserts join rows and records their persisted state, including surrogate IDs when present.
 *
 * Join tables without surrogate IDs use their foreign-key pair as the conflict target.
 */
async function m2mBatchInsert(query: QueryRunner, joinTableName: string, todo: JoinRowTodo) {
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
    const { rows } = await query(pgSql, [col1Values, col2Values]);
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
    await query(pgSql, [col1Values, col2Values]);
    for (const row of newRows) {
      row.op = JoinRowOperation.Flushed;
      row.persisted = true;
    }
  }
}

/**
 * Deletes join rows by surrogate ID or by their foreign-key pair.
 *
 * Unloaded collections may only know the pair, while loaded rows can use their surrogate IDs.
 */
async function m2mBatchDelete(query: QueryRunner, joinTableName: string, todo: JoinRowTodo) {
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
    await query(pgSql, [haveIds.map((r) => r.id!)]);
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
      await query(pgSql, [JSON.stringify(data)]);
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

# Driver Refactor Plan: BasePostgresDriver + Subclasses

## Goal

Support knex, node-pg, and (eventually) postgresql.js from the same base `PostgresDriver` class by:
- Creating a `BasePostgresDriver<TX>` that contains all shared Postgres SQL generation logic
- Creating `NodePgPostgresDriver` (TX=pg.PoolClient) in joist-orm/pg
- Creating `KnexPostgresDriver` (TX=Knex.Transaction) in joist-knex
- Using `KnexPostgresDriver` in the untagged-ids test package for coverage

## Design Decisions

- **Naming**: Base class is `BasePostgresDriver`. `NodePgPostgresDriver` is re-exported as `PostgresDriver` from `joist-orm/pg` for backwards compatibility.
- **Hook TX type**: Subclasses provide the generic so hooks receive the library-specific type (pg.PoolClient or Knex.Transaction).
- **onQuery callback**: Only on `NodePgPostgresDriver`, not in the base.
- **No per-request state on the driver**: A single driver instance serves many concurrent EntityManagers, so we cannot store `currentTxnAdapter` on the driver. `em.txn` holds per-request transaction state.

## TxnAdapter Interface

```ts
// packages/core/src/drivers/TxnAdapter.ts
export interface TxnAdapter {
  query(sql: string, bindings: readonly any[]): Promise<{ rows: any[] }>;
}
```

Returns `{ rows: any[] }` because:
- `batchUpdate` needs `result.rows` for oplock checking
- `m2mBatchInsert` needs `{ rows }` for assigning join row ids
- pg's `client.query()` returns `{ rows }`
- knex's `trx.raw()` returns `{ rows }`
- `executeQuery` calls `.then(r => r.rows)` on top of this

## BasePostgresDriver<TX>

**File**: `packages/orm/src/drivers/PostgresDriver.ts` (refactored)

### Constructor

```ts
abstract class BasePostgresDriver<TX> implements Driver<TX> {
  constructor(
    query: (sql: string, bindings: readonly any[]) => Promise<any[]>,
    opts?: { idAssigner?: IdAssigner; preloadPlugin?: PreloadPlugin },
  )
```

- `query` — for executing SQL outside a transaction (e.g. `executeQuery` when no `em.txn`)
- No `pg` import. No `onQuery`. No `setupLatestPgTypes`.
- Default `idAssigner` = `SequenceIdAssigner` using the provided `query` function

### Abstract methods

```ts
/** Convert a library-specific txn to a TxnAdapter for SQL execution. */
protected abstract toTxnAdapter(txn: TX): TxnAdapter;

/** Library-specific transaction lifecycle. */
abstract transaction<T>(em: EntityManager, fn: (txn: TX) => Promise<T>): Promise<T>;
```

### executeQuery

```ts
async executeQuery(em: EntityManager, sql: string, bindings: readonly any[]): Promise<any[]> {
  const pgSql = toPgParams(sql);
  if (em.txn) {
    return this.toTxnAdapter(em.txn as TX).query(pgSql, bindings).then(r => r.rows);
  }
  return this.#query(pgSql, bindings);
}
```

### executeFind

Unchanged — calls `buildRawQuery` then `this.executeQuery`.

### flush

```ts
async flush(em, entityTodos, joinRows) {
  const txn = this.toTxnAdapter((em.txn ?? fail("Expected EntityManager.txn to be set")) as TX);
  await this.#idAssigner.assignNewIds(entityTodos);
  const ops = generateOps(entityTodos);
  await Promise.all([
    ...ops.inserts.map((op) => batchInsert(txn, op)),
    ...ops.updates.map((op) => batchUpdate(txn, op)),
    ...ops.deletes.map((op) => batchDelete(txn, op)),
    ...Object.entries(joinRows).flatMap(([joinTableName, { m2m, newRows, deletedRows }]) => [
      m2mBatchInsert(txn, joinTableName, m2m, newRows),
      m2mBatchDelete(txn, joinTableName, m2m, deletedRows),
    ]),
  ]);
}
```

### Batch functions

All change from `(client: pg.PoolClient, ...)` to `(txn: TxnAdapter, ...)`:
- `batchInsert(txn: TxnAdapter, op: InsertOp)`
- `batchUpdate(txn: TxnAdapter, op: UpdateOp)`
- `batchDelete(txn: TxnAdapter, op: DeleteOp)`
- `m2mBatchInsert(txn: TxnAdapter, ...)`
- `m2mBatchDelete(txn: TxnAdapter, ...)`

They call `txn.query(pgSql, bindings)` instead of `client.query(pgSql, bindings)`. No `onQuery` parameter.

### What stays in the base

- `toPgParams` (? → $1 conversion) — Postgres dialect, shared by all backends
- `buildUnnestCte` — Postgres-specific bulk CTE syntax
- All SQL generation for INSERT/UPDATE/DELETE/M2M operations
- `cleanSql`, `kq`, `kqDot` usage (imported from joist-core)

### What moves out of the base

- `import pg from "pg"` — gone
- `setupLatestPgTypes` — moves to NodePgPostgresDriver
- `onQuery` callback — moves to NodePgPostgresDriver
- `pool.connect()` / `client.release()` / `BEGIN` / `COMMIT` / `ROLLBACK` — moves to NodePgPostgresDriver.transaction
- `getMaybeInTxnClient` — replaced by toTxnAdapter + the constructor query function

## NodePgPostgresDriver

**File**: `packages/orm/src/drivers/NodePgPostgresDriver.ts` (new)

```ts
import pg from "pg";

export interface PostgresDriverOpts {
  idAssigner?: IdAssigner;
  preloadPlugin?: PreloadPlugin;
  onQuery?: (sql: string) => void;
}

export class NodePgPostgresDriver extends BasePostgresDriver<pg.PoolClient> {
  readonly pool: pg.Pool;
  readonly #onQuery: ((sql: string) => void) | undefined;

  constructor(pool: pg.Pool, opts?: PostgresDriverOpts) {
    const onQuery = opts?.onQuery;
    super(
      async (sql, bindings) => {
        onQuery?.(sql);
        return (await pool.query(sql, bindings as any[])).rows;
      },
      {
        idAssigner: opts?.idAssigner ?? new SequenceIdAssigner(async (sql) => {
          onQuery?.(sql);
          return (await pool.query(sql)).rows;
        }),
        preloadPlugin: opts?.preloadPlugin,
      },
    );
    this.pool = pool;
    this.#onQuery = onQuery;
    setupLatestPgTypes(getRuntimeConfig().temporal);
  }

  protected toTxnAdapter(client: pg.PoolClient): TxnAdapter {
    return {
      query: (sql, bindings) => {
        this.#onQuery?.(sql);
        return client.query(sql, bindings as any[]);
      },
    };
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
    } finally {
      await driverAfterCommit(em, client);
      client.release();
    }
    return result;
  }
}
```

**Export**: `packages/orm/src/pg-export.ts` re-exports `NodePgPostgresDriver as PostgresDriver` + `PostgresDriverOpts` + `setupLatestPgTypes`.

## KnexPostgresDriver

**File**: `packages/knex/src/KnexPostgresDriver.ts` (new)

```ts
import { Knex } from "knex";

export interface KnexPostgresDriverOpts {
  idAssigner?: IdAssigner;
  preloadPlugin?: PreloadPlugin;
}

export class KnexPostgresDriver extends BasePostgresDriver<Knex.Transaction> {
  readonly #knex: Knex;

  constructor(knex: Knex, opts?: KnexPostgresDriverOpts) {
    super(
      async (sql, bindings) => (await knex.raw(sql, bindings as any[])).rows,
      {
        idAssigner: opts?.idAssigner ?? new SequenceIdAssigner(
          async (sql) => (await knex.raw(sql)).rows,
        ),
        preloadPlugin: opts?.preloadPlugin,
      },
    );
    this.#knex = knex;
  }

  protected toTxnAdapter(trx: Knex.Transaction): TxnAdapter {
    return { query: (sql, bindings) => trx.raw(sql, bindings as any[]) };
  }

  async transaction<T>(em: EntityManager, fn: (txn: Knex.Transaction) => Promise<T>): Promise<T> {
    if (em.txn) {
      return fn(em.txn as Knex.Transaction);
    }
    return this.#knex.transaction(async (trx) => {
      // knex.transaction handles BEGIN/COMMIT/ROLLBACK
      await driverBeforeBegin(em, trx);
      em.txn = trx;
      try {
        await driverAfterBegin(em, trx);
        const result = await fn(trx);
        await driverBeforeCommit(em, trx);
        return result;
      } finally {
        em.txn = undefined;
        await driverAfterCommit(em, trx);
      }
    });
  }
}
```

**Export**: `packages/knex/src/index.ts` exports `KnexPostgresDriver` and `KnexPostgresDriverOpts`.

## Package/Export Changes

### packages/core/src/drivers/
- New file: `TxnAdapter.ts` — exports `TxnAdapter` interface
- `index.ts` — add `export * from "./TxnAdapter"`

### packages/orm/src/drivers/
- `PostgresDriver.ts` — rename class to `BasePostgresDriver`, make abstract, remove pg dependency
- New file: `NodePgPostgresDriver.ts`

### packages/orm/src/pg-export.ts
```ts
export { NodePgPostgresDriver as PostgresDriver } from "./drivers/NodePgPostgresDriver.js";
export type { PostgresDriverOpts } from "./drivers/NodePgPostgresDriver.js";
export { setupLatestPgTypes } from "./drivers/NodePgPostgresDriver.js";
```

### packages/knex/src/
- New file: `KnexPostgresDriver.ts`
- `index.ts` — add export

### packages/knex/package.json
- Needs access to `BasePostgresDriver`. If it stays in `joist-orm`, knex package would need to peer on `joist-orm`. Currently `joist-knex` peers on `joist-core`. See open question below.

## untagged-ids Test Package Changes

### packages/tests/untagged-ids/package.json
- Add `"knex": "3.1.0"` to dependencies

### packages/tests/untagged-ids/src/setupDbTests.ts
- Import `KnexPostgresDriver` from `joist-orm/knex`
- Replace `PostgresDriver` with `KnexPostgresDriver`
- Pass the existing `knex` instance to `KnexPostgresDriver` constructor
- Remove `pool` — knex manages its own connections
- Keep `onQuery`-style tracking via knex's `.on("query")` event (already set up)
- `afterAll` only needs `knex.destroy()`, no `pool.end()`

## Open Questions

1. **`toTxnAdapter` allocation**: Called on every `executeQuery` (when in txn) and every batch op during `flush`. Creates a small `{ query }` object each time. Options:
   - Accept the tiny allocation (trivial vs DB round-trip cost)
   - Cache in a WeakMap keyed by the raw txn object
   - **Recommendation**: Just accept the allocation. It's negligible.

2. **Where does `BasePostgresDriver` live?**
   - Option A: Keep in `joist-orm` (packages/orm). Then `joist-knex` needs to import from it — but `joist-orm` already depends on `joist-knex`, creating a circular dependency.
   - Option B: Move to `joist-core` (packages/core). Clean dependency graph, but more Postgres-specific logic in "core". Core already has `buildRawQuery`, `generateOps`, `buildUnnestCte`, `cleanSql`, `EntityWriter`, `IdAssigner` etc. so this is a natural fit.
   - **Recommendation**: Option B — move to `joist-core`.

3. **`toPgParams` and `buildUnnestCte`**: Should live alongside `BasePostgresDriver` wherever it ends up (recommend joist-core).

4. **knex.raw() with $1-style params**: `toPgParams` converts `?` → `$1`. knex pg client passes raw SQL through to pg which handles `$1` natively. Confirmed this works.

5. **Backwards compat for `PostgresDriver.pool`**: `NodePgPostgresDriver` preserves the `readonly pool: pg.Pool` field. `KnexPostgresDriver` does not have a pool. Fine since they're different classes.

## Files to Create/Modify (Summary)

| File | Action |
|------|--------|
| `packages/core/src/drivers/TxnAdapter.ts` | Create |
| `packages/core/src/drivers/index.ts` | Add export |
| `packages/orm/src/drivers/PostgresDriver.ts` | Refactor → BasePostgresDriver (or move to core) |
| `packages/orm/src/drivers/NodePgPostgresDriver.ts` | Create |
| `packages/orm/src/pg-export.ts` | Update exports |
| `packages/knex/src/KnexPostgresDriver.ts` | Create |
| `packages/knex/src/index.ts` | Add export |
| `packages/knex/package.json` | Maybe add peer dep |
| `packages/tests/untagged-ids/package.json` | Add knex dep |
| `packages/tests/untagged-ids/src/setupDbTests.ts` | Switch to KnexPostgresDriver |

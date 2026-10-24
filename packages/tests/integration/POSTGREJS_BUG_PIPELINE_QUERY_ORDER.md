# PostgreJS: concurrent query calls can execute out of submission order

## Summary

PostgreJS can execute a later `query()` before an earlier `query()` on the
**same connection**, when the earlier SQL needs preparation and the later SQL
already has a cached prepared statement. This reproduces both inside an explicit
transaction and in autocommit mode. It also reproduces through a pool configured
with `max: 1` and `pipeline: true`.

This is an execution-order problem, not a connection-isolation or result-routing
problem. Each query receives its own correct result, but the database changes
happen in the opposite order from the JavaScript calls.

Pipelining itself is not fundamentally broken. Independent statements can execute
without depending on their relative order. In the tested cases, PostgreJS's
explicit `connection.pipeline([first, second])` API also preserves order. The
affected path is automatic pipelining of concurrent `query()` calls with mixed
prepared-statement cache state.

## What “cold” and “cached” mean

A prepared statement is SQL that PostgreSQL has already parsed and that the
client can execute again by name.

- **Cold statement:** PostgreJS must first ask PostgreSQL to prepare/describe it.
- **Cached statement:** PostgreJS already has its prepared statement and can
  immediately ask PostgreSQL to execute it.

For example, the application submits these calls in order without awaiting the
first result:

```js
const first = connection.query("update example set n = 1", options);
const second = connection.query("update example set n = 2", options);
await Promise.all([first, second]);
```

If the first SQL is cold and the second is cached, PostgreJS can send:

1. Prepare/describe the first SQL, but do not execute it yet.
2. Execute the second SQL: `n` becomes `2`.
3. Receive the first SQL's preparation result.
4. Execute the first SQL: `n` becomes `1`.

The final value is **1**, rather than the **2** expected from submission order.
`Promise.all` preserves the positions of its returned results; that does not
establish database execution order.

## Reproduced environment

- Date: 2026-10-24.
- Installed PostgreJS package version: `3.14.0`.
- Node: `v26.3.1`.
- PostgreSQL: `16.0`, Debian, x86_64 Linux.
- Query options include `unknownTypesAsString: true`, as Joist's driver does.
  This causes a statement's result fields to be discovered before execution,
  making the preparation boundary reproducible on its first use.
- No Joist code is required for the reproduction.

These observations are for the installed version and options above, not a claim
that every configuration or every concurrent query is reordered.

## Results

Each case used a fresh pool, one connection, and a session-local temporary table.
The second update was prepared by executing it once before the measured pair.
Both updates included `RETURNING n`; their individual results were always
`[{ n: 1 }]` and `[{ n: 2 }]` in the corresponding Promise result slots.

| Execution mode | Final value in five runs | Submission order preserved? |
| --- | --- | --- |
| Pinned connection, autocommit, concurrent `query()` | 1, 1, 1, 1, 1 | No |
| Pinned connection, explicit transaction, concurrent `query()` | 1, 1, 1, 1, 1 | No |
| Pool, `max: 1`, `pipeline: true`, concurrent `query()` | 1, 1, 1, 1, 1 | No |
| Pinned connection, concurrent `query()` with `pipeline: false` | 2, 2, 2, 2, 2 | Yes |
| Pinned connection, await each `query()` | 2, 2, 2, 2, 2 | Yes |
| Explicit `connection.pipeline([...])`, autocommit | 2, 2, 2, 2, 2 | Yes |
| Explicit `connection.pipeline([...])`, explicit transaction | 2, 2, 2, 2, 2 | Yes |

A pool with several connections has an additional concern: concurrent queries on
different connections do not generally have a global execution order. The pool
reproduction deliberately uses only one connection to exclude that explanation.

## Minimal reproduction

Save this as `reproduce.mjs` in a project with PostgreJS installed. Run it against
a database where the user can create temporary tables:

```sh
DATABASE_URL=postgres://user:password@localhost/database node reproduce.mjs
```

The script changes only session-local temporary tables, which disappear when
the connections are closed.

```js
import assert from "node:assert/strict";
import { Pool } from "postgrejs";

for (const inTransaction of [false, true]) {
  await reproduce(inTransaction);
}

/** Compares submission order with the final state on one dedicated connection. */
async function reproduce(inTransaction) {
  const pool = new Pool(process.env.DATABASE_URL);
  const connection = await pool.acquire();
  const options = {
    pipeline: true,
    unknownTypesAsString: true,
    rollbackOnError: false,
    rowDecoder: "object",
  };
  const firstSql = "update pipeline_order_probe set n = 1 returning n";
  const secondSql = "update pipeline_order_probe set n = 2 returning n";

  try {
    await connection.execute(`
      create temporary table pipeline_order_probe (n int);
      insert into pipeline_order_probe values (0);
    `);

    // Prepare only the second SQL. The first SQL has never been submitted.
    await connection.query(secondSql, options);
    if (inTransaction) await connection.execute("BEGIN");

    const first = connection.query(firstSql, options);
    const second = connection.query(secondSql, options);
    const results = await Promise.all([first, second]);

    // Results reach the correct callers despite execution being reordered.
    assert.deepEqual(results[0].rows, [{ n: 1 }]);
    assert.deepEqual(results[1].rows, [{ n: 2 }]);

    const result = await connection.query("select n from pipeline_order_probe", options);
    console.log({ inTransaction, expectedFinalValue: 2, actualFinalValue: result.rows[0].n });

    if (inTransaction) await connection.execute("ROLLBACK");
  } finally {
    await connection.close();
    await pool.close();
  }
}
```

Observed output:

```text
{ inTransaction: false, expectedFinalValue: 2, actualFinalValue: 1 }
{ inTransaction: true, expectedFinalValue: 2, actualFinalValue: 1 }
```

Control experiments:

- Change `pipeline: true` to `pipeline: false` on this dedicated connection.
- Or await the first query before submitting the second.
- Or replace the concurrent calls with
  `await connection.pipeline([firstSql, secondSql], options)`.

All three controls produced the final value `2`. The explicit pipeline API has
different transaction/error semantics: absent an existing transaction, its batch
commits or rolls back together. It is not a drop-in replacement for arbitrary
autocommit calls.

## Likely cause in PostgreJS

In the installed `connection/connection.js`, `Connection.query()` permits
concurrent calls through `enterWire()` when pipelining is enabled.

In `connection/intl-connection.js`, `_queryCached()` takes different paths:

- Cache hit: immediately calls `executeReused(...)`.
- Cache miss requiring field discovery: calls `_prepareForCache(...)`, awaits
  the preparation result, then calls `executeReused(...)`.

Nothing on this path reserves the earlier call's execution position across that
await. A later cache hit can therefore enqueue its execution first. PostgreSQL
executes the commands in the order it receives them; it cannot infer the original
JavaScript call order.

## Impact on Joist

Joist's flush submits multiple operations with `Promise.all`. Some operations
depend on submission order, including successive updates to the same row with
optimistic-lock checks and foreign-key fixups. Reordering can produce an oplock
failure or execute dependent changes in the wrong order.

Pinning the transaction connection prevents other requests from using it, but
does not prevent this ordering problem among the transaction's own statements.
The current `pipeline: false` workaround on Joist's transaction queries remains
necessary with this execution path.

Independent pool reads are a separate case: they do not require submission-order
execution merely because they are pipelined. This bug alone is not a reason to
disable pipelining for all pool reads.

## Requested upstream behavior

Preserve the execution order of pipelined `query()` calls on one connection even
when statement preparation introduces asynchronous work. Preparation may overlap,
but a later statement's execution should not overtake an earlier call's pending
execution.

If concurrent `query()` calls are intentionally unordered, document that contract
explicitly, including the mixed-cache example, and identify the ordered API that
ORMs should use. Add a real-database regression covering a cold first statement
and cached second statement in both explicit-transaction and autocommit modes.

# PostgreJS full ORM cutover experiment

This is the second commit, following the read-only prototype in
[PR #2119](https://github.com/joist-orm/joist-orm/pull/2119).
The original measurements are in [POSTGREJS-BENCHMARK.md](POSTGREJS-BENCHMARK.md).

## Implementation

```ts
import { PostgresDriver, createPostgreJsPool } from "joist-orm/pg";

const pool = createPostgreJsPool({ connectionString: process.env.DATABASE_URL });
const driver = new PostgresDriver(pool, { lazyRows: true });
// Pass driver to EntityManager as usual; await pool.end() on shutdown.
```

`PostgreJsPool.ts` implements the query/connect/release/end surface used by the
existing PostgresDriver and Knex adapter. Actual connections and wire traffic
use PostgreJS. This lets the experiment reuse Joist's SQL generation, ID
assignment, bulk flushes, m2m writes, optimistic locks and transaction hooks.
Both ordinary queries and lazy hydration participate in the same checked-out
transaction connection. Lazy reads use the public `decodeAt` hook and the
existing WireRowData retention/compaction lifecycle, without patching PostgreJS.

All application test setups now use this pool, including the Knex queries in
their contexts. The default seeding helper also uses it. The legacy node-pg
transport remains available for the benchmark controls and explicit node-pg
protocol tests. Codegen/introspection and migration tooling still depend on
node-pg; this experiment changes the ORM's runtime transport, not those tools.

### Compatibility fixes found by the suite

- Preserve pg's int8/int8-array strings and exact scalar numeric strings with a
  per-pool native type map. Numeric arrays retain their existing numeric values.
- Normalize Uint8Array parameters to Buffer, including nested arrays, so native
  inference sends bytea rather than JSON.
- Normalize Temporal inputs to PostgreSQL-compatible strings. Normalize Date
  inputs before native array inference: Joist's nullable-array sentinel can mix
  a Date with date strings, which otherwise shifts a plain date by one day in a
  non-UTC process timezone.
- Preserve raw/Knex Temporal strings and microseconds; lazy hydration can use
  native Temporal objects. Normalize lazy ZonedDateTime zones to the same
  server-rendered offset used by Joist's text serde.
- Serialize queries on checked-out connections. PostgreJS's prepared-statement
  work can let a cached query overtake a previously submitted query still being
  prepared. Joist sometimes updates the same row twice in one flush; reordering
  breaks optimistic locks and immediate-FK fixup updates. Pool queries can still
  run concurrently; transactions retain submission order.
- Distinguish pools from already-connected clients in createKnex, and await
  native asynchronous connection release.
- Transform PostgreJS's ESM dependencies in the CommonJS Jest fixtures.

### Prototype boundary

This is not a complete implementation of node-pg's public API. The factory's
pg.Pool type cast is confined to the compatibility boundary. COPY/Submittables,
cancellation, arbitrary pg connection internals, custom pg type overrides, and
every possible connection-string option are not implemented. The adapter maps
common connection settings, TimeZone and the first search_path schema; it does
not claim general startup-option parity. Raw result field metadata is currently
empty. SELECT counts come from the complete unlimited result; mutation counts
come from PostgreJS's native rowsAffected, and DDL counts remain null.

The experiment establishes feasibility for Joist's tested runtime behavior,
not production readiness or removal of the node-pg dependency. A production
driver should expose native pool/configuration types instead of the facade.
PostgreJS requires Node 20 or newer; this run used Node 26.3.1, including its
require(ESM) support for the CommonJS build. Older-runtime compatibility is not
established by this experiment.

## Validation

- Root `yarn test`: **passed**, including:
  - Integration eager: **2,760** tests.
  - Integration eager + preloading: **2,760** tests.
  - Integration lazy: **2,761** tests.
  - Integration lazy + preloading: **2,761** tests.
  - Temporal: **79** tests; separate `JOIST_ROW_DATA=1` run: **79** tests.
  - Number IDs, UUID IDs, untagged IDs, slug IDs, miscellaneous schemas,
    immediate foreign keys, ESM, Bun, Vitest and the other root test workspaces.
- Root `yarn build`: **passed**, including package/consumer typechecks and the
  module-sync interoperability check.
- Benchmark TypeScript project, lint and formatting checks.

Existing skips remain skips. The initially empty secondary fixture databases
were prepared with their real migrations and codegen; generated files did not
change. Existing integration tests caught the compatibility issues above.

## Reproduce the additional measurements

Full read comparison (same scenarios and memory methodology as the first pass):

```sh
BENCH_MODES=pg-stock,pg-wire,postgrejs-full-eager,postgrejs-full-lazy \
BENCH_OUTPUT=../../../artifacts/postgrejs-cutover \
yarn workspace joist-tests-integration benchmark:postgrejs
```

Write comparison:

```sh
yarn workspace joist-tests-integration benchmark:postgrejs-writes
```

The write benchmark creates a disposable database cloned from `joist_stock`,
then drops only that database. `DATABASE_URL` selects the source fixture and
application credentials; `BENCH_ADMIN_URL` selects a role allowed to create and
drop the clone (defaults to this repository's local Docker postgres/admin
credentials). The source database must have no active connections during cloning.

Each driver runs in a separate process. The default write cases use 100 Authors,
three warmups, 15 samples, a fresh EntityManager per request, and GC before each
timing. Real validation, defaults, hooks, reactions and SQL generation run; the
fixture's fake external API callback is a no-op, just as in tests. Effects are
checked outside the timer, and cleanup occurs outside it too.

- **Insert:** create and flush 100 Authors, including sequence ID assignment.
- **Load/update:** find 100 Authors, rename them, and flush the changes and
  associated reactive fields.
- **Transaction cycle:** insert, rename/update, and delete 100 Authors in three
  flushes within one explicit transaction, then commit.

Unlike the initial read-only experiment, the full adapter uses PostgreJS's
default prepared-statement cache and the compatibility settings described above.
These measurements compare the working configurations, not just wire decoding.
Results are local serial timings, not production throughput or concurrency tests.

## Write results

Median milliseconds for 100 Authors, 15 samples after three warmups. Parentheses
show percent faster than stock pg, using `(stock time / time - 1) × 100`:

| Scenario | pg stock | pg WireRowData | PostgreJS full eager | PostgreJS full lazy |
| --- | ---: | ---: | ---: | ---: |
| Insert + flush | 24.95 | 23.08 (+8%) | 23.24 (+7%) | 23.40 (+7%) |
| Load, rename + flush | 11.01 | 10.65 (+3%) | 10.48 (+5%) | 11.76 (-6%) |
| Insert/update/delete transaction | 45.23 | 41.87 (+8%) | 42.97 (+5%) | 43.70 (+4%) |

Writes are broadly comparable in this run; there is no large PostgreJS win.
The eager and lazy pg modes even differ on insert-only work, where the lazy
loader is unused, which illustrates the noise/process-order component of these
small differences. The transaction-ordering fix preserves correctness without
an obvious large end-to-end penalty in these cases. All persisted row counts
and rename checks passed. Samples and p90s are in
`artifacts/postgrejs-writes/results.json`.

## Full-adapter read results

Same host/runtime as the first experiment. These are fresh controls from the
same run as the full adapter, with seven samples after three warmups. Values are
median milliseconds (% faster than stock pg):

| 50,000 entities | pg stock | pg WireRowData | PostgreJS full eager | PostgreJS full lazy |
| --- | ---: | ---: | ---: | ---: |
| Hydrate only | 269.00 | 103.49 (+160%) | 191.68 (+40%) | 100.87 (+167%) |
| Read 3 fields | 280.83 | 127.25 (+121%) | 202.18 (+39%) | 125.56 (+124%) |
| Filter, then JSON on 10% | 287.41 | 124.38 (+131%) | 206.69 (+39%) | 124.11 (+132%) |
| Read all 36 fields | 468.78 | 481.13 (-3%) | 390.96 (+20%) | 504.29 (-7%) |
| Read all in reverse | 520.41 | 601.31 (-13%) | 441.74 (+18%) | 713.90 (-27%) |
| Two finds / identity hits | 526.23 | 184.53 (+185%) | 371.39 (+42%) | 184.78 (+185%) |

| 10,000 entities | pg stock | pg WireRowData | PostgreJS full eager | PostgreJS full lazy |
| --- | ---: | ---: | ---: | ---: |
| Hydrate only | 57.99 | 20.32 (+185%) | 40.02 (+45%) | 20.33 (+185%) |
| Read 3 fields | 57.70 | 24.51 (+135%) | 41.58 (+39%) | 24.43 (+136%) |
| Filter, then JSON on 10% | 58.51 | 23.46 (+149%) | 43.95 (+33%) | 23.72 (+147%) |
| Read all 36 fields | 95.32 | 97.99 (-3%) | 81.99 (+16%) | 102.56 (-7%) |
| Read all in reverse | 103.81 | 117.98 (-12%) | 90.69 (+14%) | 139.97 (-26%) |
| Two finds / identity hits | 113.00 | 37.50 (+201%) | 78.49 (+44%) | 37.42 (+202%) |

Retained memory at 50,000 entities, **heap + external MiB**:

| Scenario | pg stock | pg WireRowData | PostgreJS full eager | PostgreJS full lazy |
| --- | ---: | ---: | ---: | ---: |
| Hydrate only | 93.55 + ~0 | 17.19 + 36.59 | 85.74 + ~0 | 18.16 + 36.53 |
| Read 3 fields | 92.60 + ~0 | 19.47 + 36.87 | 85.73 + ~0 | 19.38 + 36.75 |
| Read all fields | 108.62 + ~0 | 88.17 + 36.81 | 101.75 + ~0 | 82.45 + 36.87 |

The compatibility layer preserves the large sparse-read gain and essentially
matches pg WireRowData on hydration, sparse reads and identity hits. Eager
PostgreJS remains the dense-read winner and retains less heap than eager pg.
Full lazy decoding is not uniformly faster: reverse-order full access is about
19% longer than pg WireRowData at 50k, and 37% longer than stock pg. That downside
is visible at 10k too and is not explained away as a small-case timing fluctuation;
its precise cause has not been profiled here. Full-field lazy results also retain
more combined heap/external memory than eager results.

One-row single-find medians overlap at roughly 0.8–1.2ms. All row-count, entity
checksum, identity and compaction assertions passed. Complete samples, p90s and
memory measurements (including 1 and 100 rows) are in the local ignored
`artifacts/postgrejs-cutover/results.json`.

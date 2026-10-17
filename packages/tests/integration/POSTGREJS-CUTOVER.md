# PostgreJS native driver experiment

This follows the read-only prototype and full ORM compatibility experiment in
[PR #2119](https://github.com/joist-orm/joist-orm/pull/2119).
The original measurements are in [POSTGREJS-BENCHMARK.md](POSTGREJS-BENCHMARK.md).

## Implementation

```ts
import { PostgreJsDriver, PostgresDriver } from "joist-orm/pg";
import pg from "pg";
import { Pool } from "postgrejs";

const pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const nativePool = new Pool(process.env.DATABASE_URL);

// Choose one driver at application setup; entity code is identical.
const stock = new PostgresDriver(pgPool);
const patched = new PostgresDriver(pgPool, { lazyRows: true });
const native = new PostgreJsDriver(nativePool); // lazyRows defaults to true
const nativeEager = new PostgreJsDriver(nativePool, { lazyRows: false });

// On shutdown: await pgPool.end(); await nativePool.close();
```

`PostgreJsDriver` implements Joist's driver boundary directly, using native
`Pool.acquire`, `Connection.query` and `Connection.close`. The earlier
`createPostgreJsPool` compatibility facade has been removed. No pg.Pool cast or
PostgreJS-specific branch remains in `PostgresDriver`.

`AbstractPostgresDriver` shares PostgreSQL SQL generation, sequence ID assignment,
flushes, m2m writes and optimistic locks. Each concrete driver owns its transport,
transaction lifecycle and decoding. Both use one `WireRowData` for retention,
compaction and lazy cell access. Its only layout setting is `rowHeaderBytes`:
2 for pg's field-count prefix, 0 for PostgreJS's headerless rows. PostgreJS supplies
its native decoders via `setColumnDecoders`; pg uses `setRowDescription`. The module
also contains pg's query integration, but PostgreJS does not use it or activate
the pg-protocol patch. No separate RawRowData base class is needed.

EntityManager, entities, relations and ORM flush planning are unchanged. Native
transaction callbacks receive a PostgreJS Connection, not a disguised pg client.
Applications using connection-specific APIs must use that driver's native API.
Knex remains a separate pg-backed integration; it is not part of PostgreJsDriver.
The existing seed helper and secondary test workspaces retain PostgresDriver.
Codegen and migrations also retain their existing pg setup.

## Integration test matrix

`yarn workspace joist-tests-integration test` runs four isolated processes and
databases, with no driver × preloading cross-product:

| Script | Driver | Lazy rows | Preloading | Database |
| --- | --- | --- | --- | --- |
| `test-stock` | PostgresDriver | No | No | joist_stock |
| `test-lazy` | PostgresDriver | Yes | No | joist_lazy |
| `test-postgrejs` | PostgreJsDriver | Yes | No | joist_postgrejs |
| `test-lazy-preloading` | PostgresDriver | Yes | Yes | joist_lazy_preloading |

`scripts/clone-integration-dbs.sh` prepares these databases from the migrated
integration fixture. `JOIST_DRIVER` selects the ORM transport. Knex fixture
helpers and explicit node-pg protocol tests retain a separate pg pool. They do
not route ORM entity operations through pg in the PostgreJS pass.

Focused real-database tests in `PostgreJsDriver.test.ts` cover eager/lazy value
parity and the native transaction boundary without adding another full pass.

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
- Await native asynchronous connection release. The earlier facade's createKnex
  detection change is no longer needed and has been removed.
- Transform PostgreJS's ESM dependencies in the CommonJS Jest fixtures.

### Prototype boundary

Pool configuration is native PostgreJS configuration. Joist supplies query-level
value mapping and parameter normalization for its ORM operations. Custom pg type
overrides are not PostgreJS overrides. Native queries issued directly by callers
use the caller's native options rather than Joist's query defaults. SELECT counts
come from the complete unlimited result; mutation counts come from PostgreJS's
native rowsAffected, and DDL counts remain null.

The experiment establishes feasibility for Joist's tested runtime behavior,
not production readiness or removal of the repository's node-pg dependency.
PostgreJS requires Node 20 or newer; this run used Node 26.3.1, including its
require(ESM) support for the CommonJS build. Older-runtime compatibility is not
established by this experiment.

## Validation

### Native-driver refactor validation (2026-10-17)

- Root `yarn test`: passed, including all four integration passes:
  - Stock pg: **2,763** passed.
  - Lazy pg: **2,764** passed.
  - Lazy PostgreJS: **2,764** passed.
  - Lazy pg + preloading: **2,764** passed.
- Root `yarn build`: passed, including package/consumer typechecks and module-sync checks.
- Benchmark TypeScript project, changed-file lint and formatting checks: passed.
- Read benchmark smoke check: all four runtime modes, 100 entities, matching checksums.
- Write benchmark smoke check: all four runtime modes, 10 Authors, persisted-effect checks.
- After consolidating storage back into WireRowData: build/typechecks, lint and
  the WireRowData/PostgreJsDriver integration tests passed in all four modes.

Existing skips remain. Native transaction routing, rollback and compaction tests
use the selected driver. Tests that inject malformed node-pg responses or exercise
pg-protocol explicitly remain node-pg-specific. No new timing claims are made
from the smoke checks.

### Earlier adapter run

The following counts and performance tables are the recorded pre-refactor run;
they are not fresh performance claims for the native-driver refactor.

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

Unlike the initial read-only experiment, the full driver uses PostgreJS's
default prepared-statement cache and the compatibility settings described above.
The benchmark scripts now instantiate PostgreJsDriver directly; the tables below
preserve the earlier adapter measurements. These measurements compare the working
configurations, not just wire decoding.
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

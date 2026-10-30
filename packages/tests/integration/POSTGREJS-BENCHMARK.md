# PostgreJS read benchmarks

The results below preserve the initial read-only experiment. The current benchmark
uses production drivers in three modes: `pg-stock`, `pg-wire`, and `postgrejs-lazy`.
Use `BENCH_MODES` to select a comma-separated subset, or omit it to run all three.
The prototype and its eager control have been removed; historical prototype
measurements below are not measurements of the current production driver.

## Results (2026-10-16)

Node 26.3.1, PostgreSQL 16.0, Intel i9-12900K, localhost; pg 8.23.0 and
PostgreJS 3.14.0. Median milliseconds, seven samples after three warmups:

Parentheses show percent faster than stock pg: `(stock time / time - 1) × 100`,
rounded to whole percentages. Negative values mean slower processing speed;
these are speedups, not percentage reductions in latency.

| 50,000 entities | pg stock | pg WireRowData | PostgreJS eager | PostgreJS lazy |
| --- | ---: | ---: | ---: | ---: |
| Hydrate only | 270.84 | 102.12 (+165%) | 194.03 (+40%) | 100.92 (+168%) |
| Read 3 fields | 289.75 | 121.94 (+138%) | 203.50 (+42%) | 124.98 (+132%) |
| Filter, then JSON on 10% | 295.05 | 124.08 (+138%) | 205.33 (+44%) | 122.36 (+141%) |
| Read all 36 fields | 484.32 | 471.05 (+3%) | 382.48 (+27%) | 492.30 (-2%) |
| Read all in reverse | 542.77 | 601.79 (-10%) | 443.60 (+22%) | 617.03 (-12%) |
| Two finds / identity hits | 538.38 | 183.95 (+193%) | 367.30 (+47%) | 186.39 (+189%) |

| 10,000 entities | pg stock | pg WireRowData | PostgreJS eager | PostgreJS lazy |
| --- | ---: | ---: | ---: | ---: |
| Hydrate only | 56.97 | 20.07 (+184%) | 40.64 (+40%) | 20.22 (+182%) |
| Read 3 fields | 57.89 | 23.88 (+142%) | 41.03 (+41%) | 24.28 (+138%) |
| Filter, then JSON on 10% | 60.75 | 23.41 (+160%) | 40.00 (+52%) | 24.06 (+152%) |
| Read all 36 fields | 98.79 | 93.68 (+5%) | 81.16 (+22%) | 99.91 (-1%) |
| Read all in reverse | 106.77 | 117.70 (-9%) | 86.88 (+23%) | 119.78 (-11%) |
| Two finds / identity hits | 107.70 | 37.82 (+185%) | 76.12 (+41%) | 39.73 (+171%) |

Retained memory for 50,000 entities, **JS heap + external MiB** (not RSS):

| Scenario | pg stock | pg WireRowData | PostgreJS eager | PostgreJS lazy |
| --- | ---: | ---: | ---: | ---: |
| Hydrate only | 93.55 + ~0 | 17.18 + 36.53 | 85.06 + ~0 | 18.12 + 36.40 |
| Read 3 fields | 92.60 + ~0 | 19.41 + 36.69 | 85.06 + ~0 | 19.38 + 36.69 |
| Read all fields | 108.62 + ~0 | 88.16 + 36.81 | 101.00 + ~0 | 82.39 + 36.75 |

**Interpretation:** PostgreJS lazy essentially matches Joist's patched node-pg
path: within about 5% in all six 50k cases. Its advantage here is the public,
supported raw-row hook. Against stock node-pg it is 2.3–2.9x faster on sparse,
hydration-only, and identity-map workloads, with substantially less retained
heap and less combined heap/external memory. Laziness is not a universal win:
PostgreJS eager binary is fastest for dense reads, and lazy full-field results
retain more combined memory than eager results. Reverse-order reads also pay
entity field-storage costs (visible even with stock pg), not just wire scans.

One-row medians were around 0.8–1.4ms for single finds across modes; there is no
clear small-result winner in this run. At 100 rows, hydrate-only medians were
1.68 / 1.02 / 1.75 / 0.98ms in the same column order. Small-case p90s were noisy.
This is one serial run in fixed driver order, without confidence intervals or
production traffic; interpret small differences cautiously.

All four modes passed cross-driver checksums for the fixture's 36 fields and
retention checks. The existing 22 WireRowData integration tests, prototype
typecheck, lint, and formatting checks passed. Full samples and all sizes are
in the local ignored `artifacts/postgrejs/results.json`.

## Run

Run from the repository root after `yarn install` and `yarn exec tsdown`:

```sh
yarn workspace joist-tests-integration benchmark:postgrejs
```

Requires the migrated integration fixture at
`postgres://joist:local@localhost:5435/joist_stock` (override with `DATABASE_URL`).
Creates a private schema, clones the real `authors` table, populates it, and drops
the schema in `finally`. Existing fixture data is not reset or changed.

Configuration: `BENCH_SIZES=1,100,10000,50000`, `BENCH_ITERATIONS=7`, and
`BENCH_OUTPUT` (defaults to repository `artifacts/postgrejs`). Output includes
every timing sample, medians, p90s, retained heap/external deltas, environment,
and cross-driver entity-value checksums. Typecheck with:

```sh
yarn exec tsc --project packages/tests/integration/tsconfig.postgrejs.json
```

## Implementation

The current benchmark uses `PostgreJsDriver` for ORM operations and its
`PostgreJsRowDecoder` for raw-row parity and compaction checks. Entity finds,
including paginated finds, use lazy rows. Ordinary raw queries use object rows.

The custom decoder passes PostgreJS's own per-column parsers and immutable bytes
to the existing `WireRowData`. Two small extensions allow externally supplied
decoders and a zero-byte row header (PostgreJS removes the wire field count).
The same adaptive scan cursor, retention, and compaction serve both drivers.
The current `decodeAt` hook supplies socket buffer/offset/length directly, avoiding
even a per-row Buffer view; the `decode` fallback deduplicates subarrays by their backing ArrayBuffer.
There is no PostgreJS protocol patch and no copy of each incoming row. PostgreJS
still allocates its own temporary result array of decoder return values.

The current driver uses `fetchCount: 0` (unlimited; Joist's SQL entity limit still
applies). The fixture's populated types are checked through generated entity
field serdes. The current PostgreJS mode retains native prepared-statement caching.

## Historical measurement method

The original experiment used four fresh child processes to isolate stock node-pg
from the lazy protocol patch:

1. Joist + node-pg, eager text rows.
2. Joist + node-pg `lazyRows`, binary WireRowData.
3. Joist + PostgreJS eager binary rows (additional control).
4. Joist + PostgreJS lazy binary rows.

Each uses a warm one-connection pool, three warmups per case, and seven measured
iterations. Explicit GC occurs before each timed request, not inside it. Timing
includes database execution, transport, decoding, Joist hydration and field
access. Retained memory is measured separately with live results after GC;
external bytes include buffers and should be considered alongside JS heap.
Small memory differences can be noisy. These are serial localhost request
measurements, not a concurrent throughput or production GC benchmark.
PostgreJS's automatic prepared-statement cache is disabled to match node-pg's
unnamed queries; asynchronous error-stack capture is also disabled.

All modes use the same unpaginated ordered find against the actual Author model
(36 non-ID serde fields). Rows populate strings (including Unicode), integers,
boolean, bigint, date/timestamps, text arrays, and JSON; the remaining optional
columns are null. JSON contains a roughly 150-byte address and repeated quotes.

- **hydrate:** return entities without field reads.
- **sparse:** read firstName, age, isFunny on every entity.
- **selective:** read age on every entity and two JSON fields on 10% of them.
- **full:** read all 36 fields in metadata order.
- **reverse:** read all fields in reverse order, stressing lazy offset scans.
- **identity:** two SQL finds returning the same entities; distinct filters
  bypass Joist's find-result cache and exercise duplicate-row finalization.

Correctness checks compare every serde field across drivers, test mixed existing
and new entities, and compare the PostgreJS decoder's materialization/compaction
against its eager parser after further socket reads. Existing WireRowData tests
cover the unchanged node-pg path.

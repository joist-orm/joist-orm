# JS Columnar Row Store — Option C Design Doc

Status: **experimental prototype** (2026-07-22) behind `PostgresDriverOpts.lazyRows` /
`JOIST_ROW_DATA=1`; see "Implementation results" and "Review response" at the bottom for
measured outcomes and the post-review revisions. Terminology note: the implementation is a
**lazy wire-row (row-major deferred-decode) representation** — it retains PostgreSQL's row-major
`DataRow` payloads and defers cell decoding; it is not columnar/structure-of-arrays storage
(reserve that term for a future C3-style layout). Memory note: row bytes live in Buffer backing
stores, which V8 does not trace/compact but _does_ account as external memory contributing to
RSS and GC scheduling — the win is "less traced object graph and less per-cell churn," not free
memory.
Naming note: the implementation shipped as `RowData` / `PojoRowData` / `WireRowData` — a
query's individual, read-only result — rather than this doc's earlier "RowStore" naming, which
over-suggested a long-lived, writable container. The design-body prose below keeps the original
terms; map RowStore→RowData, QueryStore→WireRowData when reading.
Companion to NATIVE-ROW-STORE-DESIGN.md; this doc deep-dives its "Option C" (pure-JS) with the
simplifications that fall out of committing to a JS-only structure-of-arrays approach.

## 1. Goal

Fork `pg-protocol`'s row parsing so that query results are kept as raw wire bytes in arenas, and
individual `row × column` cell values are decoded **only when a specific entity's field is
actually read**. Targets, in priority order:

1. Minimum V8-heap footprint for loaded-but-unread data (ideally ~zero objects per row).
2. Eliminate the ~250 ms/100k-rows of eager wire→JS materialization measured in
   `benchmark-pg-parse-split.ts` (§2 of the native doc).
3. No change to mutation/flush/reactivity semantics; existing test suite drives the port.

## 2. Why JS-only changes the design

Two facts make this design _simpler_ than its native cousin:

**There is no boundary to amortize.** The native design needed column-batch materialization
("column faulting") because each N-API crossing costs ~20-50 ns and is opaque to TurboFan. In
pure JS, a cell fault is just a function call plus `buffer.toString("utf8", start, end)` — which
is itself a heavily-optimized native-backed path. Per-cell lazy decode, the exact granularity of
today's `getField` → `serde.setOnEntity` laziness, becomes the natural default rather than a
compromise.

**Node Buffers already are "native data structures" as far as V8 is concerned.** A `Buffer`'s
backing store lives outside the V8 heap: the GC neither traces nor compacts its contents, it
only accounts them as external memory. A 300 MB arena of row bytes costs the GC the same as a
30-byte one — one handle. So the original moonshot's "keep the data in native memory" is
achievable _from JS_, with none of the FFI, build-matrix, or lifetime-refcounting machinery.
What JS cannot do (and what we give up relative to Option B): decode off the main thread,
SIMD scanning, and external (zero-copy) strings — which §3 of the native doc showed are a niche
win regardless.

## 3. Decode granularity: three sub-options

Given a per-query arena `Buffer` holding the raw `DataRow` payloads, how much structure do we
build eagerly?

### C1 — Per-cell offset tables built at parse time

While parsing, record `cellStart: Uint32Array` (one entry per row×column, plus a null bitmap).
Fault = two typed-array reads + slice + convert.

- Cost at 100k×40: ~4M entries ≈ 16-20 MB of typed arrays (off-heap) + ~20-40 ms of parse-time
  bookkeeping.

### C2 — Row-lazy: per-row offsets only, scan cells on access ("absolute minimum")

Record only `rowStart: Uint32Array` (one entry per row, 4 B/row — 400 KB at 100k). A cell fault
scans the row's length-prefixed cells from `rowStart` to the target column ordinal (an int32
read + skip per cell, ~2-4 ns each; ~40-80 ns worst case at 40 columns), then slices + converts.

Why the scan is affordable: **each (row, column) faults at most once** — the decoded value is
cached in the entity's existing `data` bag, exactly like today's lazy serde. Reading 7 fields of
one author costs 7 scans averaging ~20 cell-skips ≈ sub-µs total, once, per entity. Parse-time
work collapses to message framing (find each DataRow's extent — one length prefix read per row)
plus the arena memcpy. Upfront cost per row: **O(1) and no JS objects at all**.

- Optional micro-optimization if profiling demands: memoize the row's cell offsets on first
  fault (one small `Uint32Array` per _touched_ row) so subsequent faults on the same row skip
  the scan. Untouched rows still cost nothing.

### C3 — Column-bulk faulting (carry-over from the native design)

First access of `firstName` on any entity materializes the whole column for the store into a JS
array. In JS this is only a constant-factor win (a monomorphic tight loop, ~40-60 ns/cell vs
~100-150 ns for scattered per-cell faults) and it over-materializes for sparse access patterns.

**Recommendation: C2**, with C3 kept as an opt-in accelerator for scan-heavy workloads (bulk
exports, reactive recalcs that touch a column on every loaded row), possibly behind a simple
heuristic ("after K faults on the same column, bulk the rest"). C1 is the fallback if the C2
scan shows up in profiles; it is a local change inside the store.

## 4. Pipeline

```
socket chunks ──> vendored pg-protocol parser ──> QueryStore (transient, per query)
                    (framing only: no cell           arena: Buffer  (raw DataRow payloads)
                     strings, no per-row             rowStart: Uint32Array
                     message objects)                RowDescription: name→ordinal, oid per col
                                                     sidecar cols: _tags, __class, joins…
                                    │
                              em.hydrate(meta, store)
                                    │  per row: fault `id` (identity map key), findConcreteMeta
                                    │  faults __class/STI discriminator for inheritance metas
                                    ▼
                    MetaStore (retained, per (EntityManager, base meta))
                      arena chunks: Buffer   ── row bytes copied once from QueryStore
                      rowStart: growable Uint32Array, indexed by per-meta ordinal
                      colIndex: name → ordinal (+ pg type oid → lazy parser)
```

- **Parser fork**: `pg-protocol`'s `parseDataRowMessage` currently materializes every cell via
  `reader.string(len)`. The fork appends the DataRow payload bytes to the current query's arena
  and records `rowStart` — no `DataRowMessage`, no `fields[]` array, no strings. Integration
  uses pg's supported _custom Submittable_ seam (the same mechanism as `pg-cursor` /
  `pg-query-stream`), so connections, pooling, auth (SCRAM/IAM), TLS, and transactions all stay
  on stock `pg`. Only entity-producing `executeFind` queries opt into the store path;
  `executeQuery` and the scalar dataloaders (count/ids/paginated/lens) keep classic POJO rows.
- **pg-types stays the type authority, applied lazily**: each column's oid (from RowDescription)
  resolves its `pg-types` parser once per query; a cell fault is `utf8Slice → pgTypeParse →
serde convert`. This preserves today's exact parse behavior (jsonb → object, int4 → number,
  arrays via postgres-array, and the deliberate _non_-parsing of temporals that
  `setupLatestPgTypes` configures) — parity by construction, just deferred.

## 5. How multiple `em.find`s share the store

Two candidate ownership models:

**Query-scoped stores (no copy)**: each find's arena is retained as long as any entity from
that find is alive; entities hold `(queryStore, rowIndex)`. Simple, zero copies — but arenas
accumulate dead weight: rows for entities that were _already_ in the identity map (their new row
is discarded today) still pin bytes, and one long-lived entity pins its entire query's arena.

**Per-(EM, base-meta) consolidated stores (recommended)**: hydrate copies each _kept_ row's
bytes from the transient QueryStore into the meta's growing MetaStore (append-only arena chunks +
a growable `rowStart` array), then drops the QueryStore. This costs one sequential memcpy per
new row (a few ms per 100k rows) and buys:

- **Sharing is the data structure**: every find over Authors appends to the same MetaStore.
  The entity's row index is its _per-meta registration ordinal_ — the same order as the
  existing `#entitiesByTag` arrays, which is exactly the "entity's offset within its meta"
  framing. STI/CTI subtypes share the base meta's store (matching base-tag registration).
- **Exact retention**: duplicate rows (entity already loaded → row ignored, as today) are never
  copied, so no arena dead weight; memory is precisely "live entities' as-loaded bytes."
- **Simple lifetime**: MetaStores live and die with their EntityManager — no per-arena
  refcounting, no pinning hazards. (Arena _chunks_ of a few MB keep growth from re-copying.)
- **`em.refresh` / `overwriteExisting`**: append the fresh row bytes and repoint the entity's
  `rowStart[ordinal]` at them; already-faulted `data` keys re-fault per current refresh
  semantics. The stale bytes leak inside the arena until the EM dies — acceptable for refresh
  frequency; a compaction pass is possible but almost certainly YAGNI.
- Joist selects `alias.*` for the primary table, so a meta's column set is stable across finds;
  the rare width mismatch (e.g. a future per-query column pruning, or `lazy` columns arriving
  via their targeted batch load) is handled by tagging each row with its RowDescription id —
  rows in one store may reference different column layouts.

**Sidecar columns stay query-scoped**: `_tags` (batched-find redistribution), preload-join
aggregate columns, `__class`/STI discriminators are consumed _during_ hydrate from the
QueryStore and die with it — they never enter the MetaStore. This deletes today's
`delete row._tags` mutation and stops retaining `__class` etc. for the entity's lifetime.

`InstanceData` impact: `row: Record<string, any>` is replaced by nothing at all for the common
case — the store is found via the entity's meta + EM, and the ordinal via the registration
index. (Practically we would keep one `rowIndex` int slot, or reuse `entityIndex`.) The
`PojoStore` adapter (a store view over a plain `rows[]` array) keeps the public
`em.hydrate(type, rows)` / `createRowFromEntityData` signatures — and therefore `em.fork`,
`importEntity`, the `run()` test plugin, factories, and existing benchmarks — working unchanged.

## 6. The field-access path

```ts
// fields.ts getField — unchanged shape, store-backed miss path
export function getField(entity: Entity, fieldName: string): any {
  const instanceData = getInstanceData(entity);
  const { data } = instanceData;
  if (fieldName in data) return data[fieldName]; // warm path: identical to today
  if (!entity.isNewEntity) {
    const serde = getMetadata(entity).allFields[fieldName].serde;
    // was: serde.setOnEntity(data, row) reading row[columnName]
    serde.setOnEntity(data, instanceData.store, instanceData.rowIndex);
  }
  return data[fieldName];
}

// serde.ts — each of the 16 setOnEntity bodies changes mechanically, e.g. PrimitiveSerde:
setOnEntity(data: any, store: RowStore, row: number): void {
  // store.getValue: rowStart -> scan to column ordinal -> utf8Slice -> pg-types parse (by oid)
  data[this.fieldName] = maybeNullToUndefined(store.getValue(row, this.columnOrdinal));
}
```

The warm path — the one applications hit ~always — is byte-for-byte today's code. The cold path
swaps "read a POJO property" (~5 ns) for "scan + slice + parse" (~100-200 ns), paid once per
(entity, field) ever read, in exchange for never paying the ~60-80 ns × _every_ cell at parse
time. Break-even is roughly "the app reads more than ~half of all cells of all rows," at which
point the regression is bounded (~1.5× on decode only) and C3 column-bulk mode closes it.

## 7. Writes: (essentially) unaffected

The store is an immutable snapshot of as-loaded database state; nothing ever writes into it.

- `em.create`: new entities have no store row (today: `row = {}`); every field lives in `data`.
  Unchanged.
- `setField` / dirty tracking / reactivity: operate on `data` / `originalData` / `flushedData`
  bags. Unchanged — they never touched `row`.
- `em.flush` / `EntityWriter`: INSERT bindings read `data` via `serde.dbValue` (new entities —
  no store involved). UPDATE ops already force-fault missing changed columns through
  `getField` (`newUpdateOp`) — that fault now reads the store instead of the row POJO, same
  laziness, same values. Oplock's `__original_updated_at` reads `originalData`. Unchanged.
- Post-flush: `resetAfterFlushed` clears the bags; the store now holds _stale_ pre-update bytes
  for changed columns — exactly as today's retained `row` POJO does. Current values live in
  `data`, which shadows the store on every read. No divergence.
- m2m `JoinRows`: no entity rows involved. Unchanged.

The one genuinely new interaction: `em.refresh` (§5) repoints the row rather than mutating it.

## 8. What this deletes/simplifies relative to the native design

- No column-batch materialization API, no `materializeColumn` contract — per-cell faulting is
  the design, not a fallback.
- No external strings, so no arena pinning by GC'd strings, no per-chunk refcounts, no
  experimental N-API feature detection.
- No prebuild matrix, no cross-language interface versioning, no off-thread promise plumbing.
- No second language in the repo; the "native" memory story is Buffers.
- The dual-mode rollout (store-backed vs classic POJO rows, driver flag, test suite runs both)
  survives as the safety mechanism — it is cheap because `PojoStore` is a ~50-line adapter.

## 9. Surface changes (from the code inventory in NATIVE-ROW-STORE-DESIGN.md §7.1)

Unchanged from that inventory: **~300-450 LOC across ~20 files**, dominated by the 16
`setOnEntity` bodies (single-column, by-name reads — mechanical), `EntityManager.hydrate` /
`findConcreteMeta` / `createRowFromEntityData`, the JSON-aggregate preloader (keeps building
PojoStore-adapted rows in phase 1), and the sidecar-column dataloaders. Plus, new to this doc:
the vendored `pg-protocol` parser (~200-400 LOC fork of one file) and the `RowStoreQuery`
Submittable (~150 LOC), both in `joist-orm` (the driver package), not `joist-core`.

`pluginManager.afterFind(meta, operation, rows)` remains an observation-only hook over POJO rows.
The lazy path materializes a read-only snapshot only when a hook is registered; plugins must not
mutate it, and changes are not guaranteed to affect hydration.

## 10. Expected performance and memory

Grounded in `benchmark-pg-parse-split.ts` (100k × 40 cols, local PG; wire floor ~70 ms):

| Metric                                    |                       Today |                                                             This design (C2) |
| ----------------------------------------- | --------------------------: | ---------------------------------------------------------------------------: |
| `em.find` 100k rows, fields read later    |                      402 ms | ~140-170 ms (wire floor + framing ~10-20 ms + memcpy ~5 ms + hydrate ~60 ms) |
| + then reading 7 fields × 100k            |                     +~60 ms |                         +~70-100 ms (one-time faults) — still ~2× end-to-end |
| Pathological: read all 40 cols × all rows |                    +~150 ms |             +~400-600 ms — bounded worst case; C3 bulk mode closes to parity |
| V8-heap retained per row (row data)       | ~400-500 B (POJO + strings) |                      **~0 objects**; ~4-8 B typed-array + raw bytes off-heap |
| GC pressure from a 1M-row load            |   ~4-5 GB churn, long marks |                      arena bytes invisible to GC; churn only for read fields |
| Small find (1-50 rows)                    |                           — |    ~neutral (framing overhead is per-row O(1); PojoStore fallback available) |

The 1M-entity story compounds with the existing pass: entity-side retained is already ~299 B;
this removes the row-side ~400-500 B from the traced heap entirely, putting a 1M-entity EM at
roughly ~300 MB traced heap + ~200-400 MB untraced arena — comfortably inside default heap
limits, with GC pauses driven only by the entity objects.

## 11. Risks

| Risk                                                     | Mitigation                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Vendored `pg-protocol` drift                             | The wire protocol is frozen in practice; pin + protocol-level tests; the fork is one parser file. |
| pg-types parity bugs                                     | Reuse `pg-types` itself per cell; dual-mode test runs (store vs POJO) diff `data` values.         |
| Scan-on-access regressions for read-everything workloads | Bounded (~1.5× decode); C1 offsets or C3 bulk mode behind the same store interface.               |
| `afterFind` plugin cost                                  | Materialize a read-only POJO snapshot only when a hook is registered.                             |
| Debuggability (rows not inspectable)                     | `store.toRow(ordinal)` debug helper; heap snapshots get _smaller_ and truthful.                   |
| Refresh-heavy EMs leak stale bytes in arenas             | Bytes only, off-heap, EM-scoped; compaction if ever measured to matter.                           |
| Chunk-spanning DataRows / TOASTed large cells            | Handled at framing time (parser already reassembles); arena append is size-agnostic.              |

## 12. Phased plan (test-suite-driven)

1. **Spike**: standalone deferring parser over a captured 100k-row wire dump; confirm framing +
   memcpy lands in the ~10-25 ms range and per-cell fault ~100-200 ns (validates §10).
2. **RowStore seam**: introduce the `RowStore` interface + `PojoStore` adapter; port serde/
   `hydrate`/sidecar call sites to it with **no behavior change** (all rows still POJOs). Full
   suite green — this is most of the ~300-450 LOC and is riskless.
3. **QueryStore/MetaStore + vendored parser** behind a driver flag; run the full integration
   suite in both modes (as `PLUGINS=` does today); add store-mode rows to the benchmark suite
   (`benchmark-pg-parse-split.ts`, hydration, populate, million).
4. **Decide defaults** on the numbers; C3/C1 refinements only if profiles demand.

This ordering also preserves the option value from the native doc: if a Phase 2/B1 native
decoder is ever warranted, it plugs in at the QueryStore producer seam with everything above it
already proven.

## Implementation results (2026-07-22)

Implemented as designed, in two stages:

1. **RowStore seam**: `RowData` interface (`packages/core/src/RowData.ts`) with
   `PojoRowData` (classic POJO rows, permanent adapter for the public `em.hydrate(type, rows)`
   / `createRowFromEntityData` / fork / import / `run()` surfaces) and `emptyRowStore` (new
   entities). `InstanceData.row` became `rowData` + `rowIndex`; all 16 serde `setOnEntity`s,
   `getField`, `hydrate` (now delegating to `hydrateFromRowData`), `findConcreteMeta`, the
   preload-hydrator contract (`PreloadHydrator` now receives a `RowData`), and `LazyField`
   batch loads were ported. Zero behavior change; suite green in both plugin modes.
2. **WireRowData** (`packages/orm/src/drivers/WireRowData.ts`): the C2 "row-lazy" result —
   one arena `Buffer` of raw DataRow payloads + a `Uint32Array` of row offsets; cell faults
   scan length-prefixed cells to the column ordinal, `utf8Slice`, then apply the column's
   `pg-types` parser (resolved once per query from RowDescription, honoring
   `setupLatestPgTypes`). Fed by a `yarn patch` of `pg-protocol` that makes `DataRowMessage`
   lazy (raw payload range + a memoized `fields` getter for classic consumers), and a
   `pg/lib/query` subclass that appends payloads to the arena (the pg-cursor Submittable seam),
   so stock `pg` keeps connections/auth/TLS/pools. Enabled per-driver via
   `PostgresDriverOpts.lazyRows`; the test suite runs it via `JOIST_ROW_DATA=1`. The
   observation-only `afterFind` plugin hook materializes POJO rows via `store.toRows()` only when
   a plugin actually registered it.

One deliberate deviation from §5: the implementation uses **query-scoped results** (each find's
arena is owned by its result; entities hold `(rowData, rowIndex)` on their `InstanceData`) rather
than the per-(EM, base-meta) consolidated MetaStore. Consolidation remains a follow-up: it only
changes retention for refetch-heavy EMs (duplicate rows pinning arena bytes), not the
fresh-load numbers below.

Verification: the full integration suite passes in all four modes
({classic, store} × {stock, join-preloading}), 1906 tests each.

Measured (100k and 1M `authors` rows × ~40 columns, local PG, `benchmark-pg-parse-split.ts`,
3-run means at 100k / single runs at 1M):

| Metric                                     |  Classic |                        Store mode |                Delta |
| ------------------------------------------ | -------: | --------------------------------: | -------------------: |
| `em.find` 100k rows                        |   378 ms |                            148 ms |            **2.55×** |
| `em.find` 1M rows                          | 4,161 ms |                          1,908 ms |             **2.2×** |
| `em.find` + read 6 fields × all 100k rows  |   427 ms |                            353 ms |                 +17% |
| `em.find` + read 6 fields × all 1M rows    | 4,639 ms |                          3,835 ms |                 +17% |
| GC-traced heap holding 100k found entities | 102.7 MB | 30.3 MB (+18.4 MB untraced arena) | **3.4× less traced** |

The read-everything case (+17%) is the design's bounded worst case — per-cell faults cost more
than pg's batch decode, but only for cells actually read — and is the target for the C1/C3
refinements if profiles ever demand them. The sparse-read case (the common one) gets the full
2.2-2.55×, and per-row V8-heap cost of unread data is ~zero objects, with row bytes living in
the untraced arena (~184 MB/1M rows at this row shape).

## Distribution: removing the pg-protocol patch

The current implementation patches `pg-protocol` via yarn's `patch:` protocol, which is fine for
this monorepo but a real burden downstream: every consuming app would need its package manager
to apply the same patch (yarn patch / pnpm patch / patch-package), and un-patched installs would
silently lose lazy mode. The patch does exactly one thing — make `DataRowMessage` carry the raw
payload range and defer per-cell decode to a memoized `fields` getter — and there are three ways
to get that behavior without install-time patching, all verified against pg 8.16.3:

### Option 1 — Runtime prototype patch applied by joist-orm (recommended now)

`Parser.prototype.parseDataRowMessage` is an ordinary prototype method dispatched via `this.`,
so replacing it at runtime reaches every `Connection`'s parser, and joist-orm can resolve the
same pg-protocol module instance that pg itself uses via
`require.resolve("pg-protocol", { paths: [dirname(require.resolve("pg"))] })` (both verified).
The replacement constructs joist's own lazy message class (name/fieldCount + payload range +
memoized `fields` getter), so `messages.js` never needs touching. Applied once, lazily, only
when a `PostgresDriver` with `lazyRows: true` is constructed — zero effect for everyone else.

Safety rails, since this is monkey-patching:

- **Verification probe**: after patching, parse a synthetic DataRow through a fresh `Parser` and
  check both the lazy payload range and the compat `fields` getter round-trip; on any mismatch
  (i.e. a future pg-protocol internals rewrite), un-patch and disable `lazyRows` with a warning.
- **Duplicate-copy detection**: if the app's `Pool` was built from a _different_ pg copy (pnpm
  isolation, nested node_modules), our query subclass sees `msg.bytes === undefined` on the
  first row and the driver falls back to classic rows, warning once.

~60-80 lines; converts the install-time requirement into zero requirements.

### Option 2 — Vendored parser + custom Connection/Client (no global effects)

`new pg.Client({ connection })` is an honored constructor seam (client.js) and
`new pg.Pool({ Client })` is honored by pg-pool (both verified), so joist-orm could ship a
`JoistPgClient extends pg.Client` that injects a `Connection` subclass running a _vendored_ copy
of pg-protocol's parser (~500 lines; the wire protocol is frozen in practice) with the lazy
DataRow. Fully explicit, no shared-module patching — but users must construct their pool with
Joist's Client class, which doesn't help apps that hand Joist an existing pool, and vendoring
means tracking upstream parser fixes (e.g. the 2025 parser buffer-management leak fix).

### Option 3 — Upstream the lazy DataRowMessage to node-postgres (the end state)

The change is strictly backward-compatible — pg's own `Result.parseRow(msg.fields)` hits the
getter synchronously in the same tick and sees identical values — while enabling
zero-materialization consumers (cursors and streams could benefit too). There is standing
demand and precedent: "how to avoid pg parsing a result object" (brianc/node-postgres #2093),
bytea allocation complaints (#2240), and the maintainer has landed parser-performance rewrites
before (#2151). A small PR with our 2.2-2.55× `em.find` benchmark numbers has a plausible path;
if accepted, joist requires `pg-protocol >= x.y` and deletes both the patch and the shim.

### Recommendation

Ship Option 1 (runtime patch + probe + automatic classic-rows fallback), open the Option 3 PR
in parallel, and keep Option 2 in the back pocket if runtime patching proves unacceptable in
some environment. Under all three, `lazyRows` stays opt-in and failure modes degrade to today's
classic behavior.

### Option 1 implementation notes (2026-07-22)

Option 1 shipped in `packages/orm/src/drivers/patchPgProtocol.ts`, and the yarn patch (and its
`resolutions` entries) were deleted — the suite now runs lazy mode against _stock_ pg-protocol.
Two things changed versus the sketch above, both instructive:

- **The seam moved from `parseDataRowMessage` to `handlePacket`.** Removing the patch pin
  re-resolved pg-protocol from 1.10.3 to 1.15.0, whose 2025 parser rewrite turned the
  per-message parse functions into module-level closures — unpatchable from outside. The
  message-dispatch method `Parser.prototype.handlePacket(offset, code, length, bytes)` kept the
  same shape across 1.10-1.15, so the patch now intercepts DataRow packets (code 68) there and
  delegates every other message type to the original.
- **The verification probe earned its keep immediately**: against 1.15.0 the original
  `parseDataRowMessage` patch failed the probe and the driver fell back to classic rows with a
  warning — exactly the intended failure mode — rather than corrupting queries.

Verified: lazy suite green in both plugin modes against stock pg-protocol 1.15.0, classic suite
green, and `em.find` benchmarks identical to the install-time patch (148 ms at 100k×40).
Classic queries through the patched parser are unaffected (the memoized `fields` getter decodes
identically, same-tick, as pg's `Result.parseRow` requires — note 1.15's `mergeBuffer` can reuse
the parse buffer across chunks, so same-tick consumption is already the implicit upstream
contract).

## Review response (2026-07-22)

`JS-ROW-STORE-REVIEW.md` reviewed the initial prototype; this pass implemented its feedback
(progress annotations are inline in that doc). Summary of what changed:

- **Parser parity (review Blocker 2)**: `WireRowData` now reuses node-postgres's own
  `Result._parsers` (so pool/client/query `TypeOverrides` are honored) and each field's
  text/binary format; binary cells reach binary parsers as exact bytes (classic pg's
  `Buffer.from(utf8String)` round-trip corrupts bytes >= 0x80, so lazy mode is byte-exact where
  classic can be lossy — a documented, deliberate divergence). Differential type-zoo, custom
  pool-parser, and binary tests live in `src/WireRowData.test.ts`.
- **Error containment (Blocker 1)**: the query subclass mirrors pg's `_canceledDueToError`
  handling, so append/parse errors reject the query promise and leave the connection reusable;
  unsupported clients (i.e. pg-native) are detected _before_ submission and use classic rows.
- **Memory representation (review High 3 + Low 12)**: the 256 KiB monolithic arena is gone —
  payloads live in lazily-allocated 64 KiB chunks (oversized rows get exact-size dedicated
  chunks, no geometric recopying), `finalize` trims slack, and cell reads validate row bounds,
  field counts, and cell lengths. Zero-row results allocate nothing; a one-row result retains
  <128 bytes plus its row.
- **Retention (High 4)**: hydration `retain`s rows whose entities were kept; `finalize` adopts
  (trim) when everything was retained, and compacts down to only retained rows when the dropped
  rows hold >20% of the payload bytes (below that, the compaction copy costs more than the
  bounded leftover bytes it would save), so duplicate-heavy results no longer pin query history. Sidecar _columns_ (`_tags`, preload aggregates)
  still live inside retained rows' payloads — stripping cells requires rewriting row payloads
  and remains a follow-up.
- **Extension compat (High 5)**: initially `FieldSerde.setOnEntity(data, row)` was restored as
  the public contract with `setOnEntityFromRowData` as an optional fast path, but we later
  (2026-07-22) accepted the breaking change: `setOnEntityFromRowData(data, rowData, rowIndex)`
  is now the sole, required contract and the legacy method + `applySetOnEntity` dispatch helper
  are deleted (custom serdes fail loudly at compile time; a one-row `PojoRowData` recreates the
  old shape where needed, e.g. `RunPlugin`). `PreloadHydrator` receives plain row arrays
  everywhere except lazy mode; `InstanceData.row` is back as a deprecated materializing getter;
  `RowData.toRow(i)` supports cheap one-row compat/debugging.
- **Scope + claims (Medium 9/11, Low 13)**: `lazyRows` docs now say unpaginated `em.find` only
  (other loaders stay classic), and deferred custom-parser error timing is documented + tested.
- **Verification (review §9)**: `yarn test` now runs all four modes (classic/lazy ×
  stock/join-preloading), which CI invokes; the focused `WireRowData` suite covers protocol,
  formats, boundaries, compaction, and error containment.
- **Measured bounds (review §3/§8)**: the benchmark now reports `external`/RSS deltas and a
  held-alive retained scenario, plus a _dense_ all-columns read: at 100k×40, `em.find` is
  399 -> 160 ms, retained memory is 102.6 MB traced -> 33.3 MB traced + 29.1 MB external, and the
  dense read-everything case is 728 ms classic vs 1,199 ms lazy — the real, measured worst-case
  bound of the C2 prefix-scan tradeoff (adaptive row offsets are the profiled follow-up).

Still open (deliberately deferred): packed-package npm/pnpm/yarn install fixtures, sidecar
column stripping, per-meta consolidation evaluation, C1/C3 adaptive cell indexes, and
loader-by-loader lazy coverage beyond unpaginated finds.

### Small-result threshold investigation (2026-07-22)

We considered switching small results (1-10 rows) to eagerly-materialized `PojoRowData` on the
theory that lazy `WireRowData` overhead might not pay off at small sizes. Measured
(`benchmark-rowdata-small.ts`: end-to-end `em.find` at 1-1000 rows in both modes, plus a
no-network microbenchmark of the two representations over 40-column rows):

- End-to-end, small finds (n <= 10) are statistically identical in both modes (~500-600µs,
  round-trip dominated); lazy pulls ahead from n >= 25 and is 2.2x at n=1000.
- In isolation, for the typical sparse access pattern (~6 of 40 columns read), the lazy result
  wins at **every** size including n=1 (4.3µs vs 7.6µs) — materialization decodes every column,
  lazy faults only what is read.
- The winner flips on column _coverage_, not row count: reading all 40 columns favors
  materialized rows ~1.6x at any size — but access patterns are unknowable up-front, and at
  small n the dense penalty (~2µs/row) is invisible under the query round-trip.

Conclusion: **no row-count threshold exists**, so none was added; the decision (and where a
threshold would go if this ever changes) is documented on `WireRowData` and
`RowDataQuery.rowData`.

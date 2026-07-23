# Native Structure-of-Arrays Row Store — Design Doc

Status: design/evaluation only, no implementation. 2026-07-22.

## 1. Goal

Explore moving the read-side data plane of Joist — issuing SQL, decoding Postgres wire results,
and storing entity data — into native code, where results are decoded into structure-of-arrays
(SoA) storage indexed by each entity's offset within its meta, instead of one POJO per row. The
stated ideal is that `author.firstName` returns a JS string backed by the native store without a
copy, using whatever language minimizes copies across the JS/native boundary with the best V8
integration (Node/V8-only is acceptable).

This doc: (1) establishes where large-read time actually goes today, (2) lays out what
"zero-copy" can and cannot mean inside V8, (3) evaluates several architectures and languages,
and (4) gives a recommendation with go/no-go gates.

## 2. Where the time actually goes today

Measured on this repo (Node v26.3.1, post the 2026-07 GC-pressure pass, Appendix C of
BENCHMARK-PLAN.md), via `benchmark-pg-parse-split.ts`: 100k `authors` rows (~40 columns), local
dockerized Postgres:

| Step                                   |      Mean | Notes                                                          |
| -------------------------------------- | --------: | -------------------------------------------------------------- |
| Postgres execution (`EXPLAIN ANALYZE`) |      7 ms | server-side only                                               |
| `COPY authors TO STDOUT > /dev/null`   | ~60-90 ms | server + serialize + local pipe, i.e. the "wire floor"         |
| `pool.query` rowMode `array`           |    277 ms | node-pg protocol parse, all 4M cells materialized as JS values |
| `pool.query` (POJO rows)               |    328 ms | + one 40-key POJO per row                                      |
| `em.hydrate` over pre-fetched rows     |     55 ms | Joist entity construction only                                 |
| `em.find(Author, {})`                  |    402 ms | end to end                                                     |

Two conclusions:

1. **node-pg's JS wire decode is ~60% of a large `em.find`** (~250 ms of the 402 ms after
   subtracting the wire floor), and it eagerly materializes a JS string/value for every cell —
   including the majority of columns an app never reads — plus a 40-key POJO per row that Joist
   retains for the entity's lifetime (`InstanceData.row`).
2. **Joist's own hydration is already small** (55 ms/100k after the GC pass), and the per-access
   getter path (`getField` + `data` bag cache) is a few ns once warm.

So the profitable target is not "make `getField` native" — it is _replace eager wire→POJO
materialization with lazy, columnar storage_. That reframing drives everything below.

## 3. Boundary physics: what "zero-copy" can and cannot mean in V8

These constraints are load-bearing; several kill naive versions of the idea.

**External strings are the only zero-copy string mechanism, and they don't fit ORM data.**
V8 can wrap native memory as a JS string via `v8::String::NewExternalOneByte/TwoByte`
(exposed to Node-API only as the experimental `node_api_create_external_string_latin1/utf16`,
which explicitly reserve the right to copy anyway, reporting via a `copied` out-param). But:

- One-byte external strings must be **Latin-1**, not UTF-8. Postgres sends UTF-8. Pure-ASCII
  cells (a large share of real data) are valid in both; anything else requires transcoding —
  i.e. a copy — to Latin-1 or UTF-16 first.
- V8 refuses to externalize short strings (the same ~13-char class of thresholds as
  cons/sliced strings), and below roughly a cache line it is genuinely _faster_ to memcpy into
  a sequential V8 string than to allocate an `ExternalString` + a heap-allocated C++ resource
  object + GC-finalizer bookkeeping. Typical ORM strings (names, slugs, enums, tagged ids) are
  short. **For the common case, "zero-copy" loses to "one small copy" on V8's own terms.**
- Every external string pins its backing native buffer until GC finalizes it, so one long-lived
  string can pin a whole result arena (mitigable with per-chunk refcounts, but it is real
  complexity).

External strings are therefore a _niche_ win — long ASCII `text`/`varchar` columns — not the
foundation. (`jsonb` doesn't benefit either: it must be `JSON.parse`d into JS objects anyway.)

**Native calls cannot be inlined; property access can.** A warm JS getter reading a cached
property is ~1-5 ns and inlines into calling code. Any N-API call is ~20-50 ns of fixed overhead
and is opaque to TurboFan. (V8's Fast API calls _can_ be inlined, but may only return
primitives — not strings — and require the unstable C++ V8 API.) So a native-backed
`author.firstName` that crosses the boundary per access would be a _regression_ over today's
warm path.

**Design law that falls out:** cross the boundary once per _batch/column_, never per field
access. Native (or columnar-JS) code decodes and stores; the first read of a column materializes
JS values in bulk and caches them JS-side; every subsequent access is plain JS. The literal
"getter returns a string out of native memory with no copy" is unobtainable for typical short
strings on V8 — but "no JS value exists at all until the field is actually read, and no POJOs
ever" _is_ obtainable, and per §2 it is where the time is.

**Precedent: Prisma just retired its Rust engine for exactly this reason.** Their Rust core
executed queries and serialized complete result sets across the boundary to JS; they measured
that cross-language serialization made large result sets _slower_, and their Rust-free rewrite
is up to 3.4× faster with a 90% smaller install. The lesson is not "native is bad" — it is that
_a native data plane must never hand fully-materialized results across the boundary_. Any design
below that decays into "decode natively, then convert everything to JS" recreates Prisma's
mistake with extra steps.

## 4. Options

### Option A — Full native core (EntityManager, identity map, dirty tracking, flush in Rust/C++)

JS keeps only codegen'd facades; entities are handles into a native store; hooks/validation/
reactivity call back into JS.

Rejected. The EM's control plane is _chatty and JS-facing_: hooks, validation lambdas, reactive
rules, `changes` proxies, factories, `toMatchEntity` all run app JS against entity state. Every
one of those interactions becomes a boundary crossing (per entity, often per field); persistent
handles for ~1M entities become GC-root scanning load; and the entire test suite's semantics
(proxies, `Object.keys`, spreads) would need bug-for-bug emulation. This is the Prisma-shaped
failure mode plus a rewrite of the hardest code in the repo.

### Option B — Native columnar RowStore: native decodes the wire into SoA arenas; the JS EM sits on top

The native module owns query _results_, not entity semantics:

- Decodes `DataRow` messages into per-(query, meta) column arenas: one contiguous UTF-8 byte
  arena + `Uint32Array`-style offset/length tables + null bitmaps per column; numerics/bools/
  timestamps decoded to typed arrays (optionally requesting Postgres _binary_ format so
  `int8`/`timestamptz` never round-trip through strings at all).
- Exposes batch APIs: `materializeColumn(storeId, colId) -> JS array` (one crossing, tight
  native loop of `napi_create_*`), point reads for single-entity paths, and
  `getLongString(...)` that _may_ return an external string per the §3 heuristic (long +
  ASCII), else copies.
- `InstanceData.row` becomes `{ store, rowIndex }`; `serde.setOnEntity` becomes "fault this
  column (or cell) from the store into `data`". Everything above `data` — dirty tracking,
  reactivity, hooks, validation, flush — is untouched.

Two sub-variants for how results get _into_ native:

- **B1 — decode-only**: keep node-pg for connections, auth (SCRAM, cloud IAM), TLS, pooling,
  transactions, LISTEN/NOTIFY; hand the raw `DataRow` payload bytes (already in Node `Buffer`s,
  which N-API can view zero-copy) to the native decoder via a small fork/hook of `pg-protocol`.
  Native never owns a socket. Small, incremental, and the fallback path (classic POJO rows)
  stays one flag away.
- **B2 — full native client**: native (e.g. tokio-postgres) owns connections and decodes
  off-thread, overlapping decode with socket reads. Maximum ceiling, but re-implements the
  entire connection/auth/pool/feature surface Joist currently gets for free, and it is where
  the platform/ops costs (prebuilds, debugging, cloud-auth integrations) concentrate.

### Option C — The same SoA architecture, pure JS (no native at all)

Everything in B1's _shape_, implemented in JS: fork `pg-protocol`'s row parsing to record
`(arena, offset, length)` triples into typed arrays instead of materializing strings (one
sequential memcpy of cell bytes into a per-result arena `Buffer`), lazily materialize via
`buffer.toString("utf8", start, end)` / `buf.utf8Slice` on first read (`Buffer#toString` is
itself a native-backed fast path), numerics via `parseInt`/`parseFloat` on slices or
`DataView` reads for binary-format columns.

This is not a strawman. The measured ~250 ms of JS decode is dominated by _per-cell JS value
creation_, not by protocol scanning; a deferring parser only walks message headers and cell
lengths (a few ns/cell). Estimated decode cost drops to ~30-60 ms at 100k×40 in pure JS, i.e.
**Option C captures the large majority of Option B's win with zero build/platform/FFI risk**,
and it forces exactly the same Joist-side refactor (RowStore interface, lazy column serde,
`row` removal) that B needs. B1 then becomes "swap the arena producer for a native one" behind
the same interface.

What C cannot do: decode off the main thread, SIMD scans, binary-format decode into typed
arrays at native speed, external strings. Those are real but second-order next to
"stop materializing 4M values."

This option is expanded into its own design doc — JS-ROW-STORE-DESIGN.md — which also revisits
the decode granularity (per-cell/row-lazy instead of column-batch, since JS has no FFI crossing
to amortize), store sharing across multiple `em.find`s, and the (non-)impact on writes.

### Option D — WASM

Rejected for the data plane: WASM linear memory is a separate address space, so every string
crossing to JS is a copy plus `TextDecoder` overhead, and external strings are impossible.
(Fine for compute-only components — that is what Prisma's WASM query compiler is — but that is
not this problem.)

## 5. Language evaluation (for the native module, if built)

| Criterion                             | C++ + direct V8 API                    | C++ / N-API            | **Rust + napi-rs (N-API)**                                    | Zig / C + N-API        |
| ------------------------------------- | -------------------------------------- | ---------------------- | ------------------------------------------------------------- | ---------------------- |
| True external strings (full control)  | Yes (only route)                       | Experimental, may-copy | Experimental, may-copy (raw `node_api_*` sys calls)           | Experimental, may-copy |
| V8 Fast API calls (inlined natives)   | Yes (primitives only)                  | No                     | No                                                            | No                     |
| ABI stability across Node majors      | **No** — rebuild per V8/ABI, API churn | Yes                    | Yes                                                           | Yes                    |
| Prebuild matrix cost                  | High (per Node major × platform)       | Low (per platform)     | Low (per platform)                                            | Low                    |
| Pg protocol/client ecosystem          | libpq (C, mature)                      | libpq                  | `tokio-postgres` / `postgres-protocol` (mature, async-native) | thin                   |
| Off-thread + promise integration      | manual (libuv)                         | manual                 | tokio + ThreadsafeFunction, first-class                       | manual                 |
| Memory safety in a long-lived server  | manual                                 | manual                 | strong                                                        | mixed                  |
| Team maintainability of the FFI layer | worst                                  | poor                   | **best in class (napi-rs codegen)**                           | niche                  |

Verdict: **Rust + napi-rs**. The deciding observation is architectural: the batch-crossing
design of §3/§4 deliberately avoids needing the two things only direct-V8 C++ provides
(per-access native getters via templates/interceptors, and guaranteed external strings). Once
those are off the table, N-API's ABI stability, napi-rs ergonomics, and tokio +
`postgres-protocol` maturity dominate — and memory safety matters in a component that parses
untrusted-length wire data inside long-lived app servers. If profiling later proves that
external strings for large `text` columns are decisive and the experimental N-API externals
underperform, a ~200-line direct-V8 C++ shim can be added _behind the same RowStore interface_
without re-deciding the language.

## 6. Recommended architecture (shared by C and B1)

**RowStore contract** (the seam everything plugs into):

```ts
interface RowStore {
  /** Rows appended for one meta share a store; rowIndex is the entity's offset within it. */
  readonly rowCount: number;
  columnIndex(columnName: string): number;
  isNull(col: number, row: number): boolean;
  /** Bulk-materializes one column into a JS array (one boundary crossing). */
  materializeColumn(col: number): unknown[];
  /** Point read for single-entity paths; long ASCII text may come back external/zero-copy. */
  getValue(col: number, row: number): unknown;
}
```

- **Storage**: per-(EntityManager, meta) row groups; a find appends its rows to the meta's
  group, and the entity's `rowIndex` is its offset — note this aligns with the existing
  `#entitiesByTag` append order, and `InstanceData` already carries an `entityIndex` slot.
- **Column faulting**: `getField` misses call `materializeColumn` once and cache the resulting
  array on the store's JS wrapper (or scatter into each entity's `data` bag); subsequent reads
  of that column across _all_ entities are pure JS. Point-read fallback for small stores
  (`rowCount < ~64`), where bulk faulting would over-materialize.
- **String policy**: short strings copied (V8 wins anyway, §3); enum-ish low-cardinality columns
  interned via a per-column dictionary (huge for repeated values); long ASCII text optionally
  external (B only); `jsonb` lazily `JSON.parse`d per cell.
- **Identity map, dirty tracking, flush stay JS and unchanged**: mutation writes go to the JS
  `data`/`originalData` bags exactly as today (the store is a read-only source); `EntityWriter`
  and reactivity never see the difference. This is what keeps the existing test suite as the
  driver of the port rather than a casualty of it.
- **Lifetime**: a store is owned by its EM; arenas free when the EM is collected
  (`FinalizationRegistry`/napi finalizer). External strings (B only) take per-chunk refcounts.
- **Refresh/`overwriteExisting`**: hydrate swaps the entity's `{store, rowIndex}` to the new
  result's store; already-faulted `data` keys re-fault per current refresh semantics.

## 7. How much of joist-core moves

The honest headline: **very little of joist-core becomes native.** The native/columnar module
replaces node-pg's row _materialization_ and adds the RowStore; the JS-side refactor is
concentrated in the serde layer and the handful of places that treat `InstanceData.row` as a
POJO — a code inventory puts it at **~300-450 LOC of direct changes across ~20 files**.
EntityManager's control plane (~3.3k lines), reactivity, validation, hooks, EntityWriter, and
all relations are untouched by design.

### 7.1 `row` / serde surface inventory (from the code sweep)

Favorable structural facts:

- `instanceData.row` is _written_ in only 3 places (`InstanceData` ctor for new entities, and
  the two `hydrate` assignments at `EntityManager.ts:2186/2195`); every read is a **by-name,
  single-column lookup** (`row[columnName]`) — only `PolymorphicKeySerde` reads multiple
  columns per field. This is exactly the access pattern a columnar store wants.
- No whole-row landmines exist: core/orm never spreads, `JSON.stringify`s, or `Object.keys`-
  iterates a raw row.
- Of the 16 concrete `FieldSerde` classes in `serde.ts`, ~4 are pass-through and ~12 convert
  on read (`KeySerde` id-tagging, Temporal `from(string)` parses, `BigInt`/`Number` coercion,
  enum id→code, zod parse) — all already _lazy_ via `setOnEntity(data, row)`, so they port
  mechanically to `setOnEntity(data, store, rowIndex)`.
- `em.fork` / `importEntity` / the `run()` test plugin all round-trip through
  `createRowFromEntityData` (a synthesized POJO row), and `em.clone` never touches `row` —
  so a POJO-backed RowStore adapter covers all of them unchanged.

The concentrated difficulty (ranked):

1. **Public API takes POJO rows**: `em.hydrate(type, rows)` and `createRowFromEntityData` are
   exported and documented ("takes a result row from a custom query"); external callers exist
   (test-utils `RunPlugin`, benchmarks, user code). Resolution: the POJO-adapter RowStore is a
   permanent, supported representation — the public signatures never change.
2. **Sidecar columns live inside rows**: `__class` (CTI), the STI discriminator column,
   `_tags` (batched finds, which also `delete row._tags`), `tag`/`count`/`__source_id` in the
   count/ids/paginated/lens dataloaders. The RowStore needs per-row sidecar metadata alongside
   entity columns, and the two in-place `delete`s become sidecar reads.
3. **JSON-aggregate preloading** (`JsonAggregatePreloader`) synthesizes per-child POJO rows
   from positional `json_agg` arrays and re-enters `em.hydrate`. Phase 1 keeps it on the POJO
   adapter; decoding aggregates into sub-arenas is a later, optional phase.
4. **`pluginManager.afterFind(meta, operation, rows)`** exposes raw rows to plugins — becomes
   part of the RowStore contract (or receives the POJO adapter view).
5. **Deferred-parse contract**: `setupLatestPgTypes` deliberately keeps temporals as raw
   strings in `row` for lazy conversion by the Temporal serdes; the columnar store must
   preserve "store db-representation, convert on read" (it does so naturally — cells stay
   bytes/strings until faulted).

Estimated direct-change footprint by area: `serde.ts` ~60-90 LOC (16 `setOnEntity` bodies +
the `rowValue`/`mapFromJsonAgg` reverse path), `EntityManager.ts` ~80-110 LOC (`hydrate`,
`findConcreteMeta`, `createRowFromEntityData`, fork/import), `JsonAggregatePreloader` ~40-60,
dataloaders with synthetic columns ~40-60 across ~10 files, driver interface ~20-30,
`fields.ts`/`InstanceData.ts` ~10, test-utils/compat ~20-40.

## 8. Anticipated performance impact

Grounded in §2's measurements; ranges are deliberately wide until the spike benchmarks run.

| Workload                                                                                    |                        Today |                                     Option C (JS columnar) |                                    Option B1 (+native decode) |
| ------------------------------------------------------------------------------------------- | ---------------------------: | ---------------------------------------------------------: | ------------------------------------------------------------: |
| 100k-row `em.find`, few columns read                                                        |                      ~400 ms |                                       ~150-200 ms (2-2.5×) |        ~120-160 ms (2.5-3.3×), decode off-thread overlappable |
| 1M-entity load (per million bench: hydrate 832 ms, but find-path adds ~2.5-4 s of pg parse) |                       ~3-5 s |                                                   ~1.3-2 s |                                                      ~1-1.5 s |
| Transient allocation for the above                                                          | ~4M cell values + 100k POJOs |                                          only read columns |                                             only read columns |
| Retained bytes/entity (entity-side ~299 B + row POJO ~400-500 B today)                      |                   ~700-800 B | ~350-450 B (arena bytes are denser than V8 strings + POJO) |                                                same or better |
| Small OLTP find (1-50 rows)                                                                 |                            — |                                                   ~neutral | ~neutral (must keep point-read path; fixed FFI costs bounded) |
| Warm field access (`author.firstName` 2nd+ read)                                            |                          ~ns |                                                  unchanged |                                                     unchanged |
| First access of a column                                                                    |        ~µs (serde from POJO) |                                   similar (bulk-amortized) |                                                       similar |
| Mutation/flush/reactivity                                                                   |                            — |                                                  unchanged |                                                     unchanged |

GC impact: the 19-39% GC share measured in the hot-path benchmarks (Appendix C) falls roughly
proportionally with the eliminated cell/POJO churn on read-heavy workloads.

Not captured in rows/sec: `SELECT *` waste largely disappears (unread columns cost arena bytes,
not JS values), which also softens the case for per-query column pruning.

## 9. Risks

| Risk                                                  | Notes / mitigation                                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Boundary chattiness regression (the Prisma trap)      | Column-fault batching is the core defense; CI benchmark gate on small-find latency.                                                    |
| Platform/prebuild matrix (B only)                     | napi-rs prebuilds per platform; pure-JS Option C remains the permanent fallback behind the same interface, selectable per-driver flag. |
| pg feature surface (B2 only)                          | Avoided by recommending B1 (node-pg keeps auth/TLS/pool/notify).                                                                       |
| Arena pinning by external strings (B only)            | Restrict externals to long-ASCII heuristic + per-chunk refcounts; or ship without externals at all.                                    |
| `em.hydrate(type, rows)` is public API taking POJOs   | Keep a POJO-backed RowStore adapter so the public signature (and factories/tests) keep working.                                        |
| JSON-aggregate preloading builds synthetic child rows | Preload hydrators keep building POJO-adapter stores initially; native json→sub-arena decode is a later phase.                          |
| Node version drift on experimental N-API externals    | Externals are an optimization, never load-bearing; feature-detect and fall back to copies.                                             |
| Debuggability                                         | Row data invisible in JS heap snapshots; add store dump/inspect helpers early.                                                         |

## 10. Recommendation

**Do the architecture, defer the language.** Concretely:

1. **Phase 0 — spikes (1-2 days each, go/no-go gates):**
   - S1: standalone Rust decode of a captured 100k-row wire dump into SoA arenas — confirm
     ≥5-10× over node-pg's 250 ms (expect ~10-40 ms).
   - S2: JS deferring parser over the same dump (offsets-only scan + one arena memcpy) —
     confirm the ~30-60 ms estimate for Option C.
   - S3: `napi_create_string_utf8` bulk-materialization throughput and the external-string
     crossover length on Node 24/26 — validates the string policy numbers.
2. **Phase 1 — Option C (pure-JS columnar RowStore)** behind a driver flag, driven by the
   existing test suite in both modes (like `PLUGINS=` today). This lands the entire Joist-side
   refactor (serde faulting, `row` removal, RowStore seam) and most of the measured win with no
   native risk.
3. **Phase 2 — Option B1 (Rust + napi-rs decoder)** slotted behind the same RowStore interface,
   _only if_ Phase 1's numbers leave a gap that S1 shows native closes (off-thread decode,
   binary-format columns, SIMD). Ship with prebuilds + automatic JS fallback.
4. **Not recommended:** Option A (native EM), Option B2 (native client) as a first native step,
   WASM for the data plane, and any design where a getter performs a native call per access.

On the original framing: the literal zero-copy getter is not achievable for typical ORM strings
on V8 — V8 itself copies short strings by policy, and Postgres's UTF-8 vs V8's Latin-1/UTF-16
forces transcoding for non-ASCII regardless of language. The achievable — and per the
measurements, much larger — win is _never materializing JS values that nobody reads, and never
building row POJOs_. That win is mostly language-independent, which is why the recommendation
sequences the architecture first and admits native code only where a spike proves the residual
gap. If/when a native module is built, **Rust + napi-rs** is the choice; direct-V8 C++ is the
only route to guaranteed external strings but buys nothing else this design needs, at a steep
ABI/maintenance cost.

## Appendix: measurement + sources

- `benchmark-pg-parse-split.ts` (this directory) reproduces the §2 table.
- Existing baselines: BENCHMARK-PLAN.md Appendix C (hydrate 54 ms/100k; 1M hydrate 832 ms,
  299 B/entity retained; GC 19-39% of hot-path benchmark time).
- Node-API external strings (experimental, may-copy): nodejs.org Node-API docs
  (`node_api_create_external_string_latin1/utf16`).
- V8 string representations and short-string thresholds (cons/sliced `kMinLength` = 13,
  `CanMakeExternal` minimums): v8 `src/objects/string.h`; "Exploring V8's strings" (iliazeus).
- Prisma's Rust-engine retirement and boundary-serialization findings: prisma.io blog series
  "From Rust to TypeScript" / "Prisma ORM without Rust" (up to 3.4× faster, 90% smaller).

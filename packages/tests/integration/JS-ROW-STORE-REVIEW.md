# JS Lazy Wire Row Store Review

Review target: jj commit `3abd881f` (`feat: Lazy parse values off the wire.`), compared with
parent `326aa724`, and the current `JS-ROW-STORE-DESIGN.md` (including its distribution
proposal).

## Executive summary

The central idea is sound and worth continuing: Joist already has a lazy domain-value boundary
at field access, and `RowData` is a useful abstraction for moving the database representation
behind that boundary. Retaining PostgreSQL `DataRow` payloads avoids allocating strings and row
POJOs for fields that are never read. The reported large-result speedup is plausible, material,
and consistent with the implementation.

The current implementation is not ready to ship as a public `lazyRows` option. It is best viewed
as a successful prototype for large, sparse-read `em.find` workloads. There are three immediate
correctness/compatibility blockers:

1. The required `pg-protocol` patch is a root-workspace resolution and is not distributed with
   `joist-orm`. A normal downstream installation fails on its first lazy row, and the failure is
   not safely contained by `RowDataQuery`.
2. `WireRowData` bypasses the active node-postgres type parser registry and assumes every field
   is text. Client/pool overrides are ignored and binary results can be silently corrupted.
3. `afterFind` receives detached materialized rows. Its mutations, filtering, reordering, and
   sidecar changes are discarded before hydration.

The memory story also needs revision before this can be described as a generally efficient row
representation. Every query eagerly allocates about 260 KiB, the arena geometrically recopies
and over-allocates, and any entity retains the entire query including duplicates, sidecars, and
unused capacity. These costs are especially poor for small queries and mixed new/existing
results.

My recommended direction is:

1. Keep the `RowData` seam.
2. Fix distribution, parser parity, error containment, and plugin semantics before optimizing
   cell lookup.
3. Replace the monolithic arena with lazy fixed-size chunks or exact-size finalization.
4. Preserve existing extension APIs or introduce explicit opt-in `RowData` capabilities.
5. Treat query ownership as a policy behind `RowData`; evaluate an adopt-or-compact model before
   committing to a global per-meta store.
6. Upstream raw-row support as the intended production integration. If an interim experiment is
   required, use an explicitly supported Joist client/connection or a version-pinned startup
   integration that fails closed before submitting a query. Do not fall back after seeing the
   first row.

## What is strong

### The representation seam is well placed

`RowData` cleanly separates hydration from the physical result representation
(`packages/core/src/RowData.ts:22-29`). `PojoRowData` keeps hand-built rows and classic driver
results working, while `WireRowData` can optimize the hot PostgreSQL path. This is the strongest
part of the change and should survive regardless of the final parser integration or ownership
model.

The seam also leaves room for future representations without exposing PostgreSQL wire details to
the entity layer:

- query-scoped raw rows;
- compacted rows retained by an EntityManager;
- array-mode results;
- a future native decoder;
- a debug/materialized adapter.

### The immutable snapshot model fits Joist

Keeping database bytes immutable while field changes live in `data`, `originalData`, and
`flushedData` matches Joist's existing semantics. The built-in paths are mostly ported correctly:

- New entities use `emptyRowData`.
- Hydration eagerly seeds only the identity key and otherwise preserves lazy field reads
  (`packages/core/src/EntityManager.ts:2214-2232`).
- `overwriteExisting` swaps the row source and refreshes only fields that were already faulted
  (`packages/core/src/EntityManager.ts:2233-2268`).
- `createRowFromEntityData` uses domain data for accessed/changed fields and the row snapshot for
  untouched fields (`packages/core/src/EntityManager.ts:3452-3483`).
- Identity-map behavior remains first-row-wins unless overwrite is explicit.

This minimizes the semantic surface of deferred decoding and is the right architectural shape.

### C2 is a sensible first sparse-read experiment

Recording only row starts keeps indexing metadata small for large, wide results. For workloads
that touch a few fields on many rows, repeated prefix scans can still cost less than allocating
and parsing every field eagerly. The large unread-find and six-field results are encouraging.

Starting with C2 rather than building C1/C3 before profiles justify them is reasonable. C1 or an
adaptive row-offset cache should remain a later optimization, not a prerequisite for fixing the
current correctness and retention issues.

### The raw payload is copied synchronously

The Joist path copies the parser's raw bytes synchronously in `handleDataRow`
(`packages/orm/src/drivers/WireRowData.ts:157-160`). That is important because the
`pg-protocol` parser owns and may reuse its input buffer. `WireRowData` itself does not retain a
borrowed parser slice.

### Rollout is opt-in

`lazyRows` defaults to false (`packages/orm/src/drivers/PostgresDriver.ts:74-89`) and is currently
used only for a subset of entity finds. That limits the immediate blast radius while the design
is being proven, although the global protocol patch still affects classic consumers inside this
workspace.

## A. Design review

### 1. The high-level direction is valid

The design attacks the right allocation boundary. Joist does not need most PostgreSQL cells to
become durable JavaScript values immediately. Delaying both UTF-8 string creation and pg-type
parsing until a field is read can reduce:

- transient allocations during query parsing;
- retained row POJOs and strings;
- V8 marking work for unread fields;
- time to return a large sparse result.

This is particularly attractive for EntityManagers that load many wide rows but read a small
subset of scalar fields.

The design is less universally beneficial than the document currently suggests. Its success is
workload-dependent: query size, row width, touched column ordinals, value types, duplicate rows,
plugins, preloading, refresh behavior, and EntityManager lifetime all matter. It should be
positioned as a lazy wire-row representation with explicit fallback paths, not yet as a generally
superior replacement for node-postgres rows.

### 2. This is row-major, not columnar or structure-of-arrays

The implementation retains PostgreSQL's row-major `DataRow` payload and one offset per row
(`packages/orm/src/drivers/WireRowData.ts:20-24`). There is no column array and no structure of
arrays. The optimization is deferred decoding, not columnar locality.

This naming matters because it changes the expected performance model:

- Accessing one late column scans all preceding cell lengths in that row.
- Accessing several columns repeats those scans.
- Accessing every column performs roughly `C * (C - 1) / 2` prefix reads for a `C`-column row,
  rather than one `O(C)` pass.
- Accessing the same column across rows is still row-strided work, not a contiguous column scan.

Recommended terminology: **lazy wire-row store** or **row-major deferred-decode store**. Reserve
"columnar" for C3 or an actual column-indexed representation.

### 3. The decode-cost model is incomplete

The document says each `(row, column)` faults at most once. That is usually true for ordinary
entity field access because `InstanceData.data` caches the domain value. It is not a property of
`RowData.get` itself:

- `toRows()` reparses every cell on every call (`WireRowData.ts:65-85`).
- `afterFind` can materialize all cells and later entity access parses them again.
- `_tags` and preload sidecars are read outside ordinary field caching.
- `createRowFromEntityData` can read untouched columns again.
- ID and inheritance discrimination are mandatory hydration reads.

A more accurate model is:

```text
lazy =
  wire framing
  + arena allocation/copy/growth
  + mandatory id/discriminator/tag reads
  + sum(each uncached read: prefix scan + value allocation + pg parser + serde)

classic =
  wire framing
  + one linear decode of every cell
  + row POJO construction
  + serde work for each touched entity field
```

For `k` fields with ordinals `o1..ok`, C2 performs approximately `sum(oi)` prefix skips per row.
The break-even therefore cannot be summarized as "about half the cells" without measurements
across column order and type mix. The claimed 2-4 ns per skip and 100-200 ns fault should also be
treated as hypotheses until isolated on supported Node versions and real row shapes.

The current "read 6 fields" benchmark is an all-row sparse read, not a read-everything or bounded
worst case. Six fields out of roughly 40 does not establish dense-read behavior.

### 4. Buffers reduce tracing, not total memory cost

Moving payload bytes outside V8's traced heap is a real benefit. Buffer contents are not walked
or compacted during ordinary heap tracing. However, the statements that a 300 MB Buffer costs
the GC the same as a 30-byte Buffer and that arenas are invisible to GC are too strong.

The accurate memory model is:

- Buffer and ArrayBuffer wrappers are traced JavaScript objects.
- Backing stores appear in `process.memoryUsage().external` and/or `arrayBuffers`.
- External memory contributes to RSS and container memory limits.
- V8 accounts for external allocations when deciding when to schedule collections.
- Allocation, zeroing policy, copying, finalization, allocator fragmentation, and peak RSS still
  matter.
- A geometrically grown Buffer can temporarily retain both old and new backing stores.

The design should promise **less traced object graph and less per-cell churn**, not free or
GC-invisible memory.

### 5. Query-scoped ownership is a substantial design deviation

The original design recommends a transient query store followed by a consolidated per-meta
store. The implementation instead makes every entity retain its query's `WireRowData`
(`packages/core/src/RowData.ts:1-9`; design document lines 299-303).

This is simpler and is a good prototype choice, but the consequences extend beyond
"refetch-heavy EMs":

- One retained entity pins every row in its query.
- A mixed result with one new entity pins rows for entities already in the identity map.
- `_tags`, `__class`, and preload aggregate bytes remain in the retained arena.
- Unused arena capacity remains pinned.
- A fully decoded entity still retains both decoded values and the raw query arena.
- Large join-preload JSON can be parsed into child rows while the original aggregate bytes remain
  retained by the parent query.

Therefore the design's "exact retention" and "sidecars die after hydrate" properties do not
describe this implementation.

Full per-meta consolidation is not automatically the best correction. It introduces its own
append-only refresh waste, row-layout bookkeeping, and EntityManager-wide lifetime. A better next
step is to keep ownership hidden behind `RowData` and measure an **adopt-or-compact** policy:

- Adopt query chunks without copying when all rows are newly retained, layouts are stable, and
  no large sidecars are present.
- Compact only retained primary-row cells when duplicates, tags, discriminators, large aggregate
  sidecars, or excessive capacity make adoption wasteful.
- Consider per-meta consolidation only if repeated-overlap and refresh benchmarks show it wins.

### 6. Error timing changes are observable

Eager node-postgres parsing reports parser failures while awaiting the query. Deferred parsing can
move a custom parser exception from `await em.find(...)` to a later property read. ID and
discriminator parser failures still occur during hydration, while failures in optional fields do
not.

This can change:

- which application `try/catch` observes an error;
- whether an invalid value survives into a cache or request response before failing;
- whether a query appears successful in tracing;
- how parser side effects are ordered.

This is not necessarily a reason to reject lazy decoding, but it is a semantic change that needs
documentation and tests. A configurable eager-validation mode is probably unnecessary unless a
real compatibility need appears.

### 7. The protocol integration must be a first-class distribution decision

The implementation relies on a Yarn patch in the repository root
(`package.json:59-62`). `joist-orm` publishes only `build` and has no package dependency that
installs or applies this patch (`packages/orm/package.json:81-99`). Consequently, the public
option cannot work in a normal downstream package installation.

The design document's new runtime-patching recommendation (`JS-ROW-STORE-DESIGN.md:325-381`)
does not solve this robustly as written:

- `Parser.prototype.parseDataRowMessage` exists in the locally installed `pg-protocol` 1.10.x,
  but parsing is a module-local function in 1.15.x.
- `joist-orm` declares `pg ^8.22.0`, which depends on the newer protocol family; the workspace is
  actually testing `pg 8.16.3` with `pg-protocol 1.10.3`.
- Resolving "the" protocol instance from `require.resolve("pg")` does not prove it is the instance
  used by a supplied pool, especially with pnpm isolation, custom clients, or duplicate copies.
- Patching a shared module after one lazy driver is constructed changes classic queries using
  that module too, so it does not have zero effect on everyone else.
- Discovering missing raw fields on the first row is too late for a safe classic fallback. The
  query has started and may be stateful, locked, volatile, or inside a transaction. Re-executing
  it can change observable behavior.

The production end state should be upstream support: an explicit, stable raw-row callback or
backward-compatible lazy DataRow representation in node-postgres/pg-protocol. For an interim
prototype, an explicit Joist Client/Connection is safer than global runtime patching because its
supported versions and module identity are controlled.

If runtime integration is retained temporarily, it must:

- support an explicit, narrow pg/protocol version matrix;
- patch the actual connection parser instance used by the supplied pool;
- run a startup capability probe before any lazy query is submitted;
- fail closed or select classic execution before query submission;
- never retry a query merely because the first row lacks raw bytes;
- avoid changing DataRow behavior for unrelated classic consumers;
- include a packed-package integration test for every supported package-manager layout.

### 8. The benchmark does not establish the retained-memory claims

`benchmark-pg-parse-split.ts` records only `heapUsed` (`lines 68-80`), although the main new
allocation is external. More importantly, each measured function returns only a number. By the
post-function GC, its EntityManager, entities, and row store can already be unreachable. The
reported delta is therefore neither retained row-store memory nor peak memory.

The benchmark currently omits:

- `external`, `arrayBuffers`, RSS, and peak RSS;
- arena payload bytes versus retained capacity;
- GC count/pause time and event-loop delay;
- zero-, one-, and ten-row queries;
- dense 100% field access;
- sparse access to early versus late columns;
- duplicate/overlapping finds and one-survivor-from-large-query retention;
- preloading, large JSON/array values, non-ASCII strings, binary mode, and custom parsers;
- interleaved classic/lazy runs with explicit labels.

The benchmark's seed count is also interpolated directly into SQL (`lines 20-29`) and cleanup is
not protected by `finally`. Those are secondary issues, but easy to fix while revising it.

### 9. Claimed verification is not regression-protected

The design states that all 1,906 integration tests pass in four modes. That is useful manual
evidence, but the repository scripts run only stock and join-preloading classic modes
(`packages/tests/integration/package.json:13-15`). CI invokes those scripts without
`JOIST_ROW_DATA` (`.circleci/config.yml:70-78`).

The lazy path can regress immediately without CI noticing. The implementation also has no focused
`WireRowData` or protocol tests, so broad integration coverage cannot isolate parser, format,
boundary, or capacity behavior.

## Design claims versus implementation

| Design/document claim | Current implementation |
| --- | --- |
| JS columnar/SoA row store | Row-major PostgreSQL `DataRow` bytes with row offsets. |
| No per-row message objects | The patched parser still creates one `DataRowMessage` per row. |
| Per-meta consolidated retained store | Entities retain query-scoped `WireRowData` objects. |
| Sidecars die after hydration | Sidecars remain in the retained query arena. |
| Exact retention of live entity bytes | Duplicate rows, sidecars, slack, and unrelated rows can remain pinned. |
| Rows copied once | Rows are copied into the arena and prior bytes are recopied on each arena growth. |
| Exact pg-types parity | Active pool/client/query parsers and binary formats are bypassed. |
| Each cell faults at most once | Entity fields normally cache, but `toRows`, sidecars, and row reconstruction can reparse. |
| Small finds are neutral | Every store starts with a 256 KiB arena and 4 KiB offset table. |
| Arena append is size-agnostic | One Buffer plus 32-bit absolute offsets has growth spikes and an approximately 4 GiB ceiling. |
| `afterFind` gets a compatible view | It receives detached POJOs whose changes are discarded. |
| Arena memory is invisible to GC | Payload is untraced, but external memory is accounted and contributes to RSS/GC scheduling. |
| Six-field result is read-everything worst case | It is a sparse six-of-about-40 all-row read. |
| Dual-mode test rollout | Lazy mode is manually selectable but absent from committed scripts and CI. |

## B. Code review

Findings are ordered by severity. The first six should be addressed before exposing `lazyRows` to
downstream users.

### Blocker 1: published lazy mode lacks its required parser implementation

**References:** `package.json:59-62`, `packages/orm/package.json:81-99`,
`packages/orm/src/drivers/WireRowData.ts:157-160`

`msg.bytes` and `msg.offset` exist only because the monorepo globally patches `pg-protocol`.
Those fields do not exist in stock `DataRowMessage`. Root resolutions and `.yarn/patches` are not
part of the published `joist-orm` package.

A downstream user can construct `PostgresDriver(pool, { lazyRows: true })`, but the first returned
row passes `undefined` into `appendRow`. `bytes.copy(...)` then throws.

`RowDataQuery.handleDataRow` also omits node-postgres's normal row-handler error containment. An
append or compatibility error can escape the protocol callback instead of setting the query's
canceled/error state and rejecting predictably. Depending on the EventEmitter boundary, this can
become an uncaught exception and can leave connection state uncertain.

**Recommendation:** Do not publish or advertise the option until raw-row access is supplied by
the distributed package or a supported upstream API. Mirror node-postgres's error handling in the
custom row handler regardless of the chosen integration.

**Required tests:** Pack/install `joist-orm` in isolated npm, pnpm, and Yarn fixtures with no root
resolution; run a real lazy query; assert normal promise rejection for unsupported configurations
and connection reuse after all failures.

### Blocker 2: parser selection and binary handling do not match node-postgres

**References:** `packages/orm/src/drivers/WireRowData.ts:9-10,39-62,152-155`

`setRowDescription` always calls:

```ts
pg.types.getTypeParser(field.dataTypeID, "text")
```

Normal node-postgres resolves parsers from the active client/query `TypeOverrides` and uses each
RowDescription field's format. The lazy path therefore:

- ignores pool/client custom type parsers;
- ignores query-specific parser overrides;
- assumes binary values are UTF-8 text;
- can give an entity a different representation after a classic refresh;
- redundantly resolves parsers that `super.handleRowDescription(msg)` has already computed.

A binary `int4` is representative: converting `00 00 00 01` to a UTF-8 string and invoking a text
integer parser can produce `NaN`, corrupting identity and hydration rather than merely reducing
performance.

**Recommendation:** Reuse the parsers computed by the superclass `Result` after
`super.handleRowDescription`. Record each field's format. Pass strings to text parsers and Buffer
values to binary parsers, matching `Result.parseRow`. If the integration cannot safely support
binary mode initially, reject or fall back before query submission instead of returning corrupt
values.

**Required tests:** Differentially compare normal pg rows and `WireRowData.toRows()` for custom
pool/client parsers, text and binary formats, null/empty/non-ASCII strings, bytea, UUID, integers,
int8/numeric, floats, JSON/JSONB, arrays, dates, timestamps, and Joist's Date/Temporal settings.

### Blocker 3: `afterFind` mutations are discarded

**References:** `packages/core/src/EntityManager.ts:537-560,563-590`

Classic execution passes the same `rows` array to `afterFind` and hydration. Lazy execution calls
the hook with `rowData.toRows()` and then returns the original `rowData`. The materialized array is
detached and discarded.

This breaks existing behaviors such as:

- normalizing or redacting a column;
- adding/changing `__class` or `_tags`;
- mutating parsed JSON;
- filtering, appending, reordering, or removing rows;
- providing preload-specific sidecars.

It also parses every cell for the hook and can parse the same values again on entity access.

**Recommendation:** Preserve the existing mutable contract by making materialized rows
authoritative when a hook exists:

```ts
const rows = rowData.toRows();
pluginManager.afterFind(meta, operation, rows);
return new PojoRowData(rows);
```

This intentionally gives generic `afterFind` plugins a classic representation. If metrics-only
plugins need a zero-materialization path, add a separate read-only query/result metadata hook
rather than weakening `afterFind` compatibility.

**Required tests:** A hook that changes a scalar and relation FK, mutates JSON, changes `__class`
and `_tags`, filters/reorders rows, and participates in preloading; assert classic/lazy parity.

### High 4: fixed allocation and geometric growth make retained memory pathological

**References:** `packages/orm/src/drivers/WireRowData.ts:27-33,87-104`

Every `WireRowData` allocates a 256 KiB Buffer and a 1,024-entry `Uint32Array` before receiving a
row. A retained one-row query therefore pins roughly 260 KiB before its actual payload and object
overhead. Repeated singleton finds in one long-lived EntityManager can retain hundreds of MiB.

For large results, growth doubles one contiguous Buffer and copies all prior bytes. This means:

- amortized append is linear, but individual growth causes long synchronous copies;
- previously appended rows can be copied multiple times;
- final capacity can approach twice the payload;
- peak external memory includes both old and new arenas;
- a single large row can force a very large contiguous allocation;
- the documented payload size understates retained capacity.

`Uint32Array` row starts also silently wrap at 4 GiB. A large result can read from the wrong row
instead of failing clearly.

**Recommendation:** Use lazily allocated fixed-size chunks with chunk-relative offsets. Allow an
oversized row to receive its own chunk. Alternatively, finalize into exact-sized buffers after
query completion, but chunking avoids both repeated copies and high peak capacity. Track and expose
payload bytes and retained capacity for benchmarks, and enforce explicit size limits.

**Required tests:** 0/1/10-row stores, thousands of retained singleton finds, every growth
boundary, one oversized row, offsets near the chosen limit, and memory accounting for heap,
external, arrayBuffers, and RSS.

### High 5: query ownership retains duplicates and sidecars

**References:** `packages/core/src/RowData.ts:1-9`,
`packages/core/src/EntityManager.ts:2214-2273`, `packages/core/src/dataloaders/findDataLoader.ts:133-147`

When at least one row creates a new entity, that entity retains the entire query store. Rows for
existing identity-map entities are not adopted by those entities, but their bytes still remain in
the same arena. Batched `_tags`, inheritance selectors, and preload aggregate columns remain too.

This can make a small incremental load retain a very large query. It also means the retained
memory is based on query history rather than live entity state.

**Recommendation:** Add a query-finalization/retention step that can either adopt efficient query
chunks or compact only retained entity data. Keep this policy outside `InstanceData`; entities
should continue to see only a `RowData` and row index.

**Required tests:** All-new, all-duplicate, and mixed results; overlapping finds; one surviving
entity from a large query; batched tags; STI/CTI; join-preload JSON; refresh/repoint behavior; and
fully decoded entities.

### High 6: exported extension contracts changed incompatibly

**References:** `packages/core/src/serde.ts:31-43`,
`packages/core/src/plugins/PreloadPlugin.ts:65-72`,
`packages/core/src/InstanceData.ts:7-20`

The commit changes public or exported extension surfaces even when lazy rows are disabled:

- `FieldSerde.setOnEntity(data, row)` became `setOnEntity(data, rowData, rowIndex)`.
- `PreloadHydrator(rows: any[], entities)` became `(rows: RowData, entities)`.
- `InstanceData.row` was removed in favor of `rowData` and `rowIndex`.

The serde change is particularly dangerous because a TypeScript implementation accepting fewer
parameters can remain assignable. Existing code can compile, receive a `PojoRowData` where it
expects a row object, and silently read `undefined` properties.

Existing preload implementations using `rows.length`, indexing, or `forEach` fail in classic mode
too because all callers now wrap rows in `PojoRowData`.

**Recommendation:** Preserve the old extension contract and add an optional internal/capability
method for RowData-aware implementations. For example, built-in serdes can implement
`setOnEntityFromRowData`, while legacy serdes receive one materialized row. Add `RowData.toRow(i)`
so compatibility does not require materializing an entire query. Do the same for preload
hydrators, or treat the change explicitly as a major-version migration with compatibility docs.

Avoid exposing `hydrateFromRowData` and storage-specific `InstanceData` details unless external
drivers are intentionally expected to implement them.

**Required tests:** Compile and run unchanged custom serdes, multi-column serdes, custom preload
plugins, and direct supported `InstanceData` consumers in both classic and lazy modes.

### High 7: the global protocol patch is not backward compatible

**References:** `.yarn/patches/pg-protocol-npm-1.10.3-f64bdf6543.patch:1-70`,
`package.json:59-62`

The patch changes runtime `DataRowMessage` construction and shape globally:

- Constructor arguments change from `(length, fields)` to `(length, bytes, offset)`.
- `fields` changes from an enumerable own property to a prototype getter.
- `bytes`, `offset`, and `_fields` become enumerable own properties.
- TypeScript source, declarations, and source maps are not updated.
- All local pg-protocol consumers are changed even when `lazyRows` is false.

The lazy getter is also unsafe for consumers that retain a DataRow message beyond the synchronous
parser callback. The parser can compact or reuse its backing buffer, so a later `fields` access can
observe overwritten bytes. Joist's immediate copy is safe, but the globally patched public message
is not generally safe.

The root wildcard resolution additionally forces all protocol requests to patched 1.10.3. That
can silently downgrade consumers requiring newer versions and hides the mismatch between the
tested pg version and `joist-orm`'s declared `pg ^8.22.0` peer.

**Recommendation:** Remove the global patch as a distribution mechanism. If a protocol change is
upstreamed, preserve existing construction/shape semantics, define raw-payload lifetime clearly,
update source/declarations/maps, and run the upstream protocol test suite.

### Medium 8: pool/client handling is fragile

**References:** `packages/orm/src/drivers/WireRowData.ts:114-140`,
`packages/orm/src/drivers/PostgresDriver.ts:101-116`

`executeRowDataQuery` uses `clientOrPool instanceof pg.Pool`. This fails for a Pool from another pg
copy, a proxy/wrapper, or some custom pool implementation. Treating such a pool as a PoolClient can
break Submittable handling and may leak a checked-out client.

The custom query subclasses `require("pg/lib/query")`, a private package path, and assumes the
pure-JS connection protocol. `pg.native`, native/custom clients, and future pg package export
restrictions are not accounted for.

`PostgresDriver` already knows whether it has an active transaction. It can explicitly acquire a
client for the non-transaction path and make the lower-level helper PoolClient-only, eliminating
the `instanceof` branch.

**Recommendation:** Centralize checkout/release in `PostgresDriver`, probe supported client/query
capabilities before submission, and fall back before query execution for unsupported native or
custom clients. Prefer a public query export or supported raw-row API over a private path.

### Medium 9: driver capability flags can become inconsistent

**References:** `packages/core/src/drivers/Driver.ts:23-31`,
`packages/core/src/dataloaders/findDataLoader.ts:80-84,133-138`

`lazyRows` and `executeFindRowData` are independently optional, but call sites interpret the flag
as proof that the method exists and use a non-null assertion. A custom driver with `lazyRows: true`
and no method fails at runtime.

The new method also bypasses subclasses that previously customized `executeFind` or
`executeQuery` for tracing, routing, retries, tenancy, or result transforms.

**Recommendation:** Use a single discriminated capability or check the function itself. Define a
protected raw execution seam in `PostgresDriver` so subclasses can preserve routing/tracing.

### Medium 10: lazy execution covers only unpaginated `findDataLoader`

**References:** `packages/core/src/dataloaders/findDataLoader.ts:74-85,133-147`

The option's description broadly says entity find results are lazy, but only single and batched
unpaginated `em.find` calls route through `executeFindRowData`. These remain classic:

- `em.load` and refresh;
- paginated finds;
- lens/relation loaders;
- lazy-column batch loads;
- populate-only queries.

As a result, adding pagination or reaching the same entity through another API changes parsing,
plugin, and error-timing behavior. Refresh replaces a lazy row source with `PojoRowData`, so the
documented lazy refresh/arena behavior is not implemented.

**Recommendation:** Either narrow the option/docs to "unpaginated PostgreSQL finds" or centralize
row execution and deliberately classify every loader. Extend only after focused parity tests;
broader coverage is not required to validate the initial optimization.

### Medium 11: dense access is quadratic in column count

**References:** `packages/orm/src/drivers/WireRowData.ts:39-54`

Each `get` starts scanning at the beginning of the row. Reading all `C` columns performs `O(C^2)`
prefix reads. Late mandatory columns such as inheritance discriminators and sidecars can also make
hydration pay long scans before application code reads a field.

This is a design tradeoff, not a launch blocker. The current code is appropriately simple for a
sparse-read spike.

**Recommendation:** After correctness and memory changes, profile one of:

- lazily build offsets for a row after its second or third access;
- cache the furthest scan position plus discovered offsets;
- eagerly index only mandatory/hot columns;
- switch a query to full offsets after a measured fault threshold.

Do not add C3 column materialization until representative export/serialization profiles show it
beats an adaptive row index.

### Medium 12: lazy parser exceptions occur outside query execution

**References:** `packages/orm/src/drivers/WireRowData.ts:39-54`

Because the parser function is retained and invoked by `get`, non-ID parse failures can occur long
after the query promise resolves. This is intentional deferred work but currently undocumented.
Parser functions with side effects can also observe different timing and may be invoked more than
once through `toRows` and later field access.

**Recommendation:** Document the timing, ensure tracing can attribute field-fault failures, and add
tests that make the behavior explicit. Fix `afterFind` to prevent avoidable double parsing.

### Low 13: wire boundaries and indexes are trusted

**References:** `packages/orm/src/drivers/WireRowData.ts:39-53,87-104`

`get` does not validate `rowIndex`, field count, cell length, or row end. `appendRow` does not store
row ends. With `Buffer.allocUnsafe`, malformed/truncated lengths can read unused arena capacity.
Unknown column probes intentionally return `undefined`, but invalid row indexes can produce
confusing Buffer errors.

A trusted PostgreSQL server usually makes malformed wire data unlikely, but explicit invariants
are valuable because this code bypasses the protocol reader that formerly performed the scan.

**Recommendation:** Validate payload structure once while appending or track row ends and validate
on access. Guard negative/overflow lengths, field-count mismatches, truncated cells, and storage
limits. Chunk-relative offsets naturally remove the 4 GiB absolute-offset wrap.

### Low 14: documentation overstates implementation completeness

**References:** `packages/tests/integration/JS-ROW-STORE-DESIGN.md:276-323`

The status says "implemented" and several result claims use stronger wording than the current
prototype supports. In particular, "implemented as designed," "read-everything," "sidecars die,"
"zero behavior change," and the retained-memory figures should be qualified.

**Recommendation:** Mark the implementation as experimental, distinguish measured payload from
arena capacity, identify the query-scoped deviation and loader scope prominently, and separate
manual test evidence from CI guarantees.

## C. Recommended changes

### Phase 0: do not ship the current public option

Treat `lazyRows` as repository-internal until all of the following are true:

- The built/published package includes a supported raw-row integration.
- Unsupported pg/client/protocol configurations are detected before query submission.
- Errors reject safely and leave the connection reusable.
- Active parsers and text/binary formats match node-postgres.
- `afterFind` behavior matches classic mode.
- Existing public extension contracts have a compatibility plan.

### Phase 1: correctness and compatibility

1. Make materialized plugin rows authoritative by returning `PojoRowData` after `afterFind`.
2. Reuse node-postgres's active Result parsers and formats.
3. Mirror `Query.handleDataRow` error handling and connection cancellation semantics.
4. Replace independent `lazyRows?`/`executeFindRowData?` fields with one capability.
5. Make the raw query helper accept an already checked-out supported client only.
6. Add startup/version capability checks and reject unsupported native/custom clients.
7. Preserve legacy `FieldSerde`, `PreloadHydrator`, and supported `InstanceData` behavior, or make
   this explicitly a major release with a migration API.
8. Add `RowData.toRow(index)` for cheap compatibility and debugging; define whether returned
   object values are cached.

### Phase 2: production protocol integration

Preferred order:

1. **Upstream support:** contribute a stable raw-row seam to node-postgres/pg-protocol. The API
   should preserve classic DataRow behavior, define payload lifetime, and expose parser formats.
2. **Explicit Joist Client/Connection for an interim experiment:** support a narrow pg version
   range and require users to construct compatible pools deliberately.
3. **Version-pinned runtime patch only as a short-lived fallback:** patch the actual parser used by
   the connection, prove capability before queries, avoid global classic behavior changes, and
   never attempt first-row retry.

The current design document recommends option 1 runtime patching as the immediate solution. I
would reverse that recommendation: prefer the explicit client for controlled experiments and
upstream support for production. Runtime patching is smaller in lines of code, but it pushes
version/module identity risk into every application and is already incompatible with the declared
pg peer's protocol implementation.

### Phase 3: fix the memory representation

1. Allocate no payload buffer until the first row arrives.
2. Store payloads in fixed-size chunks and give oversized rows dedicated chunks.
3. Store chunk-relative row starts and row lengths/ends.
4. Track payload bytes, capacity, sidecar bytes, and adopted/compacted bytes.
5. Finalize each query by choosing direct chunk adoption or retained-row compaction.
6. Ensure zero-row and small-row queries retain only small metadata.
7. Consider releasing raw row storage once all useful entity fields are materialized only if
   profiles show a meaningful long-lived dense-read workload; field-level reference tracking may
   cost more than it saves.

### Phase 4: broaden query coverage deliberately

Create one EntityManager helper that requests `RowData` from a capable driver and otherwise wraps
classic rows in `PojoRowData`. Classify these paths one by one:

- unpaginated find;
- paginated find;
- ID load and refresh;
- relation/lens loads;
- lazy-column loads;
- populate/preload queries.

Do not route all paths to wire rows merely for consistency. Keep classic execution where results
are small, immediately fully consumed, plugin-heavy, binary-unsupported, or dominated by sidecar
data.

### Phase 5: optimize cell lookup only after profiling

Compare C2 with an adaptive per-row offset cache under realistic entity shapes. Collect:

- number of `get` calls per row;
- requested column ordinal distribution;
- repeated decode counts;
- offset scan steps;
- offset-cache bytes;
- percentage of rows never touched after ID hydration.

A likely minimal improvement is to preserve C2 for the first access and build/cache offsets only
after a row crosses a small fault threshold. This keeps unread/singly-read rows cheap while making
dense rows linear rather than quadratic.

## Required test plan

### Focused unit/protocol tests

- Null, empty, short, long, and multibyte text cells.
- All built-in pg/Joist scalar, JSON, array, temporal, and bytea mappings.
- Text and binary formats.
- Global, pool, client, and query type-parser overrides.
- Field count, row start/end, truncated values, negative lengths, and oversized payloads.
- Arena/chunk and row-index growth boundaries.
- Repeated `get`, `toRow`, and `toRows` behavior.
- Parser callback errors and connection reuse.
- Parser-buffer reuse and raw-payload lifetime.

### Semantic parity tests

- New hydration, duplicate hydration, and `overwriteExisting`.
- Refresh after untouched, accessed, changed, and flushed fields.
- STI and CTI concrete-type selection.
- Batched `_tags` redistribution.
- Join preloading and large aggregate sidecars.
- Mutation, dirty tracking, oplock, flush, and post-flush reads.
- Fork, import, test `run()`, and `createRowFromEntityData`.
- `afterFind` mutation/filter/reorder semantics.
- Legacy custom serde, preload plugin, and custom driver behavior.
- Deferred parser-error timing.

### Installation/version matrix

- Packed `joist-orm` installed outside the monorepo.
- npm, pnpm, and Yarn layouts.
- Minimum and latest supported `pg` versions.
- Their native `pg-protocol` and `pg-types` dependencies, without wildcard downgrades.
- Duplicate/nested pg copies.
- Pure-JS pg, `pg.native`, wrapped pools, and custom Clients.

### CI matrix

At minimum, run:

| Row mode | Preloading mode |
| --- | --- |
| Classic | Stock |
| Classic | Join preloading |
| Lazy | Stock |
| Lazy | Join preloading |

Focused protocol tests and the packed-package smoke test should be separate from the DB-backed
integration matrix so failures identify the broken layer.

## Benchmark plan

Run classic and lazy modes explicitly in the same benchmark process where possible, alternate
their order, and label every result. Hold the EntityManager/entities alive while measuring
retained memory.

Recommended workload dimensions:

- Rows: 0, 1, 10, 50, 1k, 100k, 1M.
- Width: about 5, 40, and 100 columns.
- Access: ID-only, 1 field, 6 fields, 25%, 50%, and 100%.
- Locality: early columns, late columns, random columns, all rows, and sparse rows.
- Types: short text, long UTF-8, null-heavy, JSON, arrays, numeric/int8, temporals, bytea.
- Query history: all new, all duplicate, mixed, overlap, refresh, and one retained entity from a
  large result.
- Integration: no plugin, `afterFind`, join preloading, pagination, and serialization/export.

Record:

- wall and CPU time;
- event-loop delay;
- GC count and pause time;
- `heapUsed`, `external`, `arrayBuffers`, and RSS;
- payload bytes and retained arena capacity;
- peak allocation during growth/finalization;
- prefix-scan count and parser invocation count.

The existing large sparse-read numbers are still valuable, but they should be presented as one
favorable workload rather than proof of a bounded all-workload improvement.

## Suggested acceptance gates

Before opt-in public release:

- Packed-package lazy query succeeds on every supported pg version/package manager.
- Classic/lazy values are differential-equal for all supported formats and parser overrides.
- `afterFind` and custom extension parity tests pass.
- Unsupported configurations fail or choose classic mode before query submission.
- One-row lazy retained capacity is proportional to the row, not 256 KiB.
- No silent offset wrap or malformed-row overread is possible.
- Four-mode integration CI is required.

Before making lazy mode the default:

- Small-query latency and retained memory are neutral or a heuristic keeps them classic.
- Dense-read workloads have an understood bound from measurements, not estimates.
- Long-lived overlap/refresh/preload workloads do not retain materially more RSS than classic.
- Production telemetry can distinguish query time from deferred field-decode time and failures.

## Review verification

This review combined source/diff inspection with focused probes. It did not rerun the full shared
database suite. The focused verification produced these results:

- The existing lazy-mode plugin test subset passed (23 tests), showing that broad hook invocation
  still works.
- An `afterFind` hook that replaced `first_name` with `"plugin"` produced `"plugin"` in classic
  mode and the original database value in lazy mode, confirming that hook mutations are detached.
- A pool-specific parser produced `"custom:7"` in classic mode and `7` in lazy mode, confirming
  that active parser overrides are bypassed.
- A binary integer result produced `7` in classic mode and `NaN` in lazy mode, confirming data
  corruption rather than merely a parser-selection difference.
- Constructing 100 `WireRowData` instances increased external memory by approximately 25.2 MiB,
  consistent with the fixed 256 KiB arena per store.
- A reproduced 100k-row run measured approximately 401.6 ms classic versus 164.4 ms lazy for
  `em.find`, a real 2.44x win for the favorable unread workload.
- The same run plus six fields on every row measured approximately 460.9 ms classic versus
  364.3 ms lazy end-to-end. The incremental field-read phase was about 59.3 ms classic versus
  199.9 ms lazy, showing both the overall benefit and the substantially higher first-read cost.

These probes reinforce the main conclusion: the optimization has real upside, while the parser,
plugin, and memory issues are release blockers rather than speculative edge cases.

## Final assessment

`RowData` and lazy wire retention are a promising architectural direction, and the prototype
demonstrates enough upside to justify another iteration. The current commit should not be merged
as a completed/distributable feature without changes: it has downstream installation failure,
type-parser correctness bugs, plugin semantic regressions, public extension incompatibilities,
and severe small-query retention behavior.

The next iteration should remain deliberately simple: preserve `RowData`, make the parser path
correct and distributable, fall back to `PojoRowData` at compatibility boundaries, and use
chunked/lazy storage. Only then should C1/C3, full loader coverage, or per-meta consolidation be
considered. That ordering protects correctness while retaining the measured benefit that makes
the approach worthwhile.

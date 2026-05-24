# EntityManager Hot-Path Benchmark Plan

## Goal

Identify CPU and heap optimizations for large Joist workloads with 10,000-100,000 entities flowing through `EntityManager`, `find`, `populate`, and `flush` paths.

The first pass should prioritize isolated, high-precision microbenchmarks over end-to-end timings. Database benchmarks are still useful, but only after separating ORM CPU/heap costs from network and PostgreSQL variance.

## Initial Overview

The existing `benchmark.ts` is mostly a database-driver insert comparison. It is useful for SQL shape decisions, but it does not isolate the ORM hot loops in `packages/core/src/EntityManager.ts`.

Relevant hot paths from the initial scan:

- `EntityManager.hydrate` maps rows into entities and registers them in identity maps.
- `EntityManager.loadAll` / `loadAllIfExists` create tagged ids, repeatedly consult the identity map, and rebuild result arrays.
- `EntityManager.flush` repeatedly scans `this.entities`, builds `Todo` groups, combines join rows, runs validation, and resets per-entity state.
- `createTodos` groups pending operations by base metadata and is called several times during flush loops.
- `generateOps` / `collectBindings` allocate columnar binding arrays for inserts and updates.
- `setField` runs on every entity mutation and pays for metadata lookup, plugin hooks, reactive queueing, equality checks, and index maintenance.
- `IndexManager` avoids linear scans for `findWithNewOrChanged`, but currently builds indexes for all fields once a type crosses the threshold.
- `findDataLoader` pays for query parsing, object hashing, batch key generation, unnest CTE rewriting, hydration, and result redistribution.
- `populateBatchLoader` builds hint trees, walks relations, creates promise sets/arrays, and may do per-layer preload SQL preparation.
- `ReactionsManager` queues and recalculates reactive fields using maps, sets, string keys, `Promise.allSettled`, and reverse-hint walks.

## Benchmark Harness Requirements

Create a new benchmark script instead of extending the existing driver-focused script, likely `packages/tests/integration/benchmark-em-hotpaths.ts`.

Use this measurement shape for each scenario:

- Run with `node --expose-gc` through `tsx` so each measured sample can force GC before/after.
- Report p50, p90, p99, mean, standard deviation, and relative standard deviation.
- Report `process.cpuUsage`, wall-clock `performance.now`, `process.memoryUsage().heapUsed`, and retained heap after forced GC.
- Include warmup iterations until timings stabilize before recording samples.
- Run sizes `1_000`, `10_000`, `50_000`, and `100_000` where feasible.
- Prefer in-memory scenarios first; add database-backed scenarios only when the ORM work cannot be isolated.
- For DB-backed scenarios, seed once, reuse data, run serially, and reset between samples only when correctness requires it.

Suggested output format:

```text
scenario,size,samples,p50_ms,p90_ms,p99_ms,mean_ms,rsd_pct,cpu_user_ms,cpu_system_ms,heap_delta_mb,heap_retained_mb
hydrate-authors,10000,40,...
```

## Focus Areas

### 1. Hydration And Registration

Files: `packages/core/src/EntityManager.ts`, especially `hydrate` and `#doRegister`.

Benchmark:

- Hydrate synthetic `Author` rows into a fresh `EntityManager`.
- Hydrate the same rows again with `overwriteExisting` false and true.
- Compare base entities vs STI/CTI rows if fixtures make that easy.

Hypotheses:

- `keyToTaggedId`, `findConcreteMeta`, `newEntity`, and `getInstanceData` dominate CPU.
- Registering into `#entitiesArray`, `#entitiesById`, and `#entitiesByTag` creates measurable heap churn.
- `overwriteExisting` pays for `Object.keys(data)`, metadata lookup, and changed-field checks.

Possible optimizations:

- Cache concrete metadata decisions per row `__class` value for a hydrate call.
- Avoid repeated metadata lookups inside `overwriteExisting` loops.
- Pre-size per-tag arrays or reduce duplicate id map writes where possible.

### 2. Identity Map LoadAll Paths

Files: `EntityManager.loadAll`, `loadAllIfExists`, `findExistingInstance`.

Benchmark:

- Load 10,000-100,000 already-hydrated entities by id.
- Run mixed hit/miss loads with DB disabled or mocked where possible.
- Compare `loadAll` vs `loadAllIfExists` allocation profiles.

Hypotheses:

- `ids.map`, `ids.filter`, and the second pass through `ids` allocate avoidable intermediate arrays.
- Tagged-id creation is repeated even when callers pass already-tagged ids.
- Missing-id detection in `loadAll` can report inaccurately when missing ids shift result positions.

Possible optimizations:

- Use a single pre-sized result loop that tracks misses and ids-to-load.
- Avoid extra closure allocations in `.map/.filter` chains in high-volume paths.

### 3. Flush Entity Scanning

Files: `EntityManager.flush`, `findPendingFlushEntities`, `pendingChanges`, `entities` getter.

Benchmark:

- Load 100,000 clean entities, mutate 0, 1, 100, and 10,000 entities, then flush with DB writes disabled or transaction rolled back.
- Compare default flush vs `skipValidation`.
- Include a no-op flush against a large identity map.

Hypotheses:

- `this.entities` returns a copy of the full entity array; `flush` calls it multiple times.
- `findPendingFlushEntities` scans all loaded entities even when only a small dirty subset exists.
- Repeated `Set` creation for pending flush/hooks contributes retained heap pressure.

Possible optimizations:

- Track dirty/touched/deleted entities incrementally and flush from a pending set.
- Internally use `#entitiesArray` where a defensive copy is not needed.
- Avoid recomputing full pending scans after hooks unless hooks actually mutated new entities.

### 4. Todo Creation And Grouping

Files: `packages/core/src/Todo.ts`, `EntityManager.flush`, `EntityManager.assignNewIds`, `flushDeletes`.

Benchmark:

- Build todos for homogeneous inserts, mixed inserts/updates/deletes, and STI/CTI entities.
- Repeat `createTodos` over the same pending entity set to model flush hook loops.

Hypotheses:

- `getInstanceData(entity).pendingOperation` and `getMetadata(entity)` dominate repeated todo creation.
- `Todo.groupInsertsByTypeAndSubType` allocates arrays/maps even for homogeneous non-inheritance cases.

Possible optimizations:

- Cache base metadata on `InstanceData` or in generated constructors.
- Special-case homogeneous and no-inheritance todo groups.
- Reuse todo structures across flush phases when entity membership has not changed.

### 5. SQL Operation Generation And Binding Collection

Files: `packages/core/src/drivers/EntityWriter.ts`.

Benchmark:

- Generate insert ops for 10,000-100,000 entities with 5, 20, and 50 columns.
- Generate update ops where all entities change the same field vs many distinct fields.
- Measure allocations from `collectBindings` and changed-field union construction.

Hypotheses:

- Columnar `any[][]` arrays are necessary for current SQL, but expensive at 100,000 rows.
- Update generation calls `getField` to lazily hydrate missing changed fields and may inflate row data into entity data.
- `columns` calculation is repeated for identical entity types.

Possible optimizations:

- Cache insert/update column lists by metadata and changed-field signature.
- Avoid `entities.some` and repeated metadata paths when the todo can carry touched counts.
- Consider chunked binding collection to cap peak heap.

### 6. Field Mutation Cost

Files: `packages/core/src/fields.ts`, relation setters, `IndexManager`, `ReactionsManager`.

Benchmark:

- Set primitive string fields across 10,000-100,000 new entities.
- Set m2o relations across 10,000-100,000 entities using ids and entity instances.
- Compare no-op sets, actual changes, reverting changes, and indexed vs non-indexed types.

Hypotheses:

- Every set pays for plugin manager access, loaded-cache invalidation, metadata lookup, string sanitization checks, equality logic, and reactive queues.
- `maybeRequireTemporal` is already cached, but `equalOrSameEntity` still has branchy general-purpose logic for primitive hot paths.
- Index updates are cheap when no indexes exist, but expensive after index activation.

Possible optimizations:

- Generate field-specific fast paths for common primitive setters.
- Cache field metadata in generated setters and pass it into `setField`.
- Split primitive equality from relation/array/Temporal equality.

### 7. In-Memory Find Indexing

Files: `packages/core/src/IndexManager.ts`, `EntityManager.filterEntities`, `findWithNewOrChanged`, `findOrCreateDataLoader`.

Benchmark:

- Call `findWithNewOrChanged` repeatedly on 10,000-100,000 loaded entities.
- Compare single-field, two-field, missing-value, relation-value, and subtype filters.
- Measure first-call index build separately from steady-state indexed lookups.

Hypotheses:

- `enableIndexingForType` builds indexes for every field, even when queries use only one or two fields.
- `findMatching` allocates a new `FieldIndex` for missing fields and spreads sets for entity/id dual matches.
- Set intersections allocate new sets per condition.

Possible optimizations:

- Build indexes lazily per queried field instead of all fields.
- Intersect by iterating the smallest set into a result array when no later mutation is needed.
- Avoid allocating throwaway `FieldIndex` instances for unindexed fields.

### 8. Find Query Preparation And Batching

Files: `packages/core/src/dataloaders/findDataLoader.ts`, `QueryParser`, `QueryVisitor`, `unnest` helpers.

Benchmark:

- Issue many `em.find` calls with identical structure and different values in one tick.
- Compare one query vs batched 10, 100, and 1,000 queries.
- Isolate parser/hash cost by mocking `driver.executeFind`.

Hypotheses:

- `object-hash` md5 cache keys may dominate simple finds.
- `JSON.stringify(hint)` in batch keys repeats for common hints.
- Batched result redistribution touches both `rows` and `_tags` arrays and deletes row properties.

Possible optimizations:

- Replace `object-hash` for common filter shapes with a simpler stable key.
- Cache parsed query structures for repeated find shapes.
- Avoid deleting `_tags` if hydration/consumers ignore unknown columns.

### 9. Populate Breadth-First Loading

Files: `packages/core/src/EntityManager.ts`, `packages/core/src/batchloaders/populateBatchLoader.ts`, preloader implementations.

Benchmark:

- Populate `books`, `books.reviews`, and sibling hints across 10,000 authors.
- Compare preload plugin enabled/disabled.
- Include already-loaded and already-preloaded relations to measure skip overhead.

Hypotheses:

- `toArray(...).filter`, `list.map`, `buildHintTree`, `Set<Promise>`, and per-layer maps allocate heavily.
- Nested hint rewriting creates sets for every layer, even when relation results are empty or already loaded.
- Direct `BatchLoader` paths reduce per-entity promises but still create many temporary relation arrays.

Possible optimizations:

- Early return before `buildHintTree` when all requested top-level relations are already loaded.
- Use arrays instead of sets when deduplication is not needed or can happen at the loader level.
- Reuse hint-tree structures for identical populate calls.

### 10. Reactive Recalculation Queueing

Files: `packages/core/src/ReactionsManager.ts`, `packages/core/src/reactiveHints.ts`.

Benchmark:

- Mutate source fields on 10,000-100,000 entities with no reactive fields, one sync reactive field, and multiple downstream fields.
- Measure queueing separately from `recalcPendingReactables`.
- Include delete/create queueing paths.

Hypotheses:

- `r.fields.includes(fieldName)` scans per reactable on every field set.
- Recalc builds string keys like `${entity.toTaggedString()}_${r.name}` for dedupe.
- `Promise.allSettled` allocates result objects for every action.

Possible optimizations:

- Pre-index reactables by source field name.
- Use nested `Map<Entity, Set<Reactable>>` or numeric ids instead of string keys.
- Use `Promise.all` in paths that do not need suppressed per-action failures.

## Recommended Order

1. Flush no-op and sparse-dirty scanning.
2. Hydration and registration.
3. Todo creation and operation generation.
4. Field mutation cost.
5. In-memory find indexing.
6. Find query preparation and hashing.
7. Populate breadth-first loading.
8. Reactive recalculation queueing.

This order starts with likely broad wins that affect every large unit of work, then moves into feature-specific hot paths.

## Acceptance Criteria For Each Area

Before changing production code for an area:

- Capture baseline benchmark results and heap profile notes.
- Identify the top allocation or CPU source with evidence from instrumentation.
- Implement the smallest plausible optimization.
- Re-run the same benchmark with at least 3 independent process runs.
- Keep or add a regression benchmark scenario if the optimization is non-obvious.
- Run the relevant integration test subset from `packages/tests/integration`.

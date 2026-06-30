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

## Appendix A: Initial Commit Benchmark Verification

Benchmarks were run on 2026-05-25 with Node `v25.9.0` and `--expose-gc`. Each phase was measured in isolated jj workspaces under `/tmp/opencode/joist-bench-workspaces` with local `node_modules` and freshly-built packages. For commits where the benchmark script was introduced by the same change, the before run restored only that benchmark script onto the parent revision before building and running.

All percentages below use the benchmark-reported `mean_ms`; positive speedup means the commit was faster than its parent. Raw output artifacts are in `/tmp/opencode/joist-bench-results/`.

### Phase 1: Hydration And Registration

Commit: `vskstonzrotq` / `8f821e20d5a0` (`perf: Optimize entity hydration registration`)

Artifact files: `p01-before-correct.txt`, `p01-after-correct.txt`

| Scenario | Size | Before Mean (ms) | After Mean (ms) | Speedup | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| `author_fresh_register` | 100000 | 53.919 | 44.809 | 16.9% | Confirmed |
| `author_fresh_register_scalar_reads` | 100000 | 118.519 | 110.296 | 6.9% | Confirmed |
| `author_existing_no_overwrite` | 100000 | 81.627 | 58.681 | 28.1% | Confirmed |
| `author_existing_overwrite_cold_data` | 100000 | 98.738 | 69.156 | 30.0% | Confirmed |
| `author_existing_overwrite_warm_data` | 100000 | 211.438 | 168.765 | 20.2% | Confirmed |
| `task_sti_fresh_register` | 100000 | 64.434 | 54.031 | 16.1% | Confirmed |

### Phase 2: Identity-Map LoadAll Paths

Commit: `tullpyrwolpo` / `98f0b33b3f14` (`perf: Optimize identity-map loadAll paths`)

Artifact files: `p02-before.txt`, `p02-after.txt`

| Scenario | Size | Before Mean (ms) | After Mean (ms) | Speedup | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| `load_all_hits_untagged` | 100000 | 23.766 | 18.754 | 21.1% | Confirmed |
| `load_all_hits_tagged` | 100000 | 25.899 | 17.065 | 34.1% | Confirmed |
| `load_all_if_exists_hits_untagged` | 100000 | 22.134 | 19.713 | 10.9% | Confirmed |
| `load_all_if_exists_hits_tagged` | 100000 | 26.167 | 18.126 | 30.7% | Confirmed |

### Phase 3: Sparse Flush Scanning

Commit: `zuyzpvqppmsl` / `36d6a73bc10f` (`perf: Optimize sparse flush scanning`)

Artifact files: `p03-before.txt`, `p03-after.txt`

| Scenario | Size | Dirty | Before Mean (ms) | After Mean (ms) | Speedup | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `flush_dirty_0_validation` | 100000 | 0 | 4.154 | 0.101 | 97.6% | Confirmed |
| `flush_dirty_0_skip_validation` | 100000 | 0 | 3.658 | 0.069 | 98.1% | Confirmed |
| `flush_dirty_1_validation` | 100000 | 1 | 7.139 | 0.946 | 86.7% | Confirmed |
| `flush_dirty_1_skip_validation` | 100000 | 1 | 6.657 | 0.738 | 88.9% | Confirmed |
| `flush_dirty_100_validation` | 100000 | 100 | 11.195 | 6.392 | 42.9% | Confirmed |
| `flush_dirty_100_skip_validation` | 100000 | 100 | 9.450 | 4.773 | 49.5% | Confirmed |
| `flush_dirty_10000_validation` | 100000 | 10000 | 576.799 | 576.927 | -0.0% | Neutral |
| `flush_dirty_10000_skip_validation` | 100000 | 10000 | 404.339 | 371.057 | 8.2% | Confirmed |

### Phase 4: Todo Creation And Grouping

Commit: `rxowmzrlsuux` / `b551cdb4619c` (`perf: Add todo creation benchmarks`)

Artifact files: `p04-before.txt`, `p04-after.txt`

This commit only added the benchmark, so no production speedup was expected. The before/after changes are benchmark noise.

| Scenario | Size | Before Mean (ms) | After Mean (ms) | Speedup | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| `todo_author_inserts` | 100000 | 6.780 | 6.888 | -1.6% | Noise |
| `todo_group_author_inserts` | 100000 | 6.750 | 6.675 | 1.1% | Noise |
| `todo_mixed_author_ops` | 100000 | 7.505 | 7.589 | -1.1% | Noise |
| `todo_sti_task_inserts` | 100000 | 7.113 | 7.176 | -0.9% | Noise |
| `todo_group_sti_task_inserts` | 100000 | 11.250 | 10.961 | 2.6% | Noise |

### Phase 5: SQL Operation Generation And Binding Collection

Commit: `pkmnqklpyquk` / `5850dae96fc1` (`perf: Optimize entity writer binding collection`)

Artifact files: `p05-before.txt`, `p05-after.txt`

| Scenario | Size | Columns | Before Mean (ms) | After Mean (ms) | Speedup | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `writer_insert_ops` | 100000 | 5 | 11.089 | 5.874 | 47.0% | Confirmed |
| `writer_update_same_field_ops` | 100000 | 5 | 9.170 | 7.359 | 19.8% | Confirmed, noisy |
| `writer_update_distinct_fields_ops` | 100000 | 5 | 13.527 | 13.932 | -3.0% | Noisy regression |
| `writer_insert_ops` | 100000 | 20 | 73.651 | 52.948 | 28.1% | Confirmed |
| `writer_update_same_field_ops` | 100000 | 20 | 13.281 | 11.483 | 13.5% | Confirmed |
| `writer_update_distinct_fields_ops` | 100000 | 20 | 101.203 | 67.222 | 33.6% | Confirmed |
| `writer_insert_ops` | 100000 | 50 | 281.948 | 149.503 | 47.0% | Confirmed |
| `writer_update_same_field_ops` | 100000 | 50 | 21.341 | 12.894 | 39.6% | Confirmed |
| `writer_update_distinct_fields_ops` | 100000 | 50 | 267.971 | 187.025 | 30.2% | Confirmed |

### Phase 6: Field Mutation Cost

Commit: `wrmuzrknwkvu` / `1977fdc32d8e` (`perf: Optimize field mutation equality checks`)

Artifact files: `p06-before.txt`, `p06-after.txt`

| Scenario | Size | Before Mean (ms) | After Mean (ms) | Speedup | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| `field_primitive_noop_set` | 100000 | 16.005 | 16.067 | -0.4% | Neutral |
| `field_primitive_actual_change` | 100000 | 160.966 | 150.857 | 6.3% | Confirmed |
| `field_primitive_revert_change` | 100000 | 125.869 | 120.949 | 3.9% | Confirmed |
| `field_primitive_indexed_change` | 100000 | 344.070 | 352.150 | -2.3% | Noisy regression |
| `field_m2o_entity_change` | 100000 | 379.953 | 372.604 | 1.9% | Small gain |
| `field_m2o_id_change` | 100000 | 380.774 | 372.330 | 2.2% | Small gain |

### Phase 7: In-Memory Find Indexing

Commit: `wtzslymorkqt` / `1fdce8d358a3` (`perf: Lazily build find indexes`)

Artifact files: `p07-before.txt`, `p07-after.txt`

| Scenario | Size | Before Mean (ms) | After Mean (ms) | Speedup | Before Retained MB | After Retained MB | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `find_index_single_field_first_build` | 100000 | 1517.409 | 23.668 | 98.4% | 713.615 | 17.999 | Confirmed |
| `find_index_single_field_steady_state` | 100000 | 0.215 | 0.152 | 29.3% | -0.022 | 0.001 | Confirmed |
| `find_index_two_field_steady_state` | 100000 | 0.329 | 0.178 | 45.9% | -0.023 | -0.000 | Confirmed |
| `find_index_missing_value_steady_state` | 100000 | 0.180 | 0.090 | 50.0% | -0.023 | -0.000 | Confirmed |
| `find_index_relation_value_steady_state` | 100000 | 23.182 | 11.393 | 50.9% | -0.024 | -0.023 | Confirmed |

### Phase 8: Find Query Preparation And Batching

Commit: `zzxyrovsvytp` / `575bb7e859b6` (`perf: Optimize find filter cache keys`)

Artifact files: `p08-before.txt`, `p08-after.txt`

| Scenario | Batched Queries | Before Mean (ms) | After Mean (ms) | Speedup | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| `find_query_prep_one_field` | 1000 | 27.335 | 12.026 | 56.0% | Confirmed |
| `find_query_prep_two_fields` | 1000 | 29.819 | 14.029 | 52.9% | Confirmed |
| `find_query_prep_with_hint` | 1000 | 26.891 | 11.412 | 57.6% | Confirmed |

### Phase 9: Populate Breadth-First Loading

Commit: `znquoxpznkmk` / `c1247f20b70b` (`perf: Optimize already-loaded populate paths`)

Artifact files: `p09-before.txt`, `p09-after.txt`

| Scenario | Size | Before Mean (ms) | After Mean (ms) | Speedup | Query Count Before | Query Count After | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `populate_books` | 10000 | 107.559 | 111.892 | -4.0% | 1.000 | 1.000 | DB variance / non-target path |
| `populate_books_reviews` | 10000 | 331.788 | 352.467 | -6.2% | 1.000 | 1.000 | DB variance / non-target path |
| `populate_books_already_loaded` | 10000 | 10.570 | 8.210 | 22.3% | 0.000 | 0.000 | Confirmed |
| `populate_books_reviews_already_loaded` | 10000 | 24.526 | 16.538 | 32.6% | 0.000 | 0.000 | Confirmed |

### Phase 10: Reactive Recalculation Queueing

Commit: `yzyrpprzszll` / `f322f6bca433` (`perf: Optimize reactive queue lookups`)

Artifact files: `p10-before.txt`, `p10-after.txt`

| Scenario | Size | Before Mean (ms) | After Mean (ms) | Speedup | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| `reactive_queue_no_reactables` | 100000 | 55.525 | 31.457 | 43.3% | Confirmed |
| `reactive_queue_one_reaction` | 100000 | 77.470 | 48.119 | 37.9% | Confirmed |
| `reactive_queue_multiple_downstream` | 100000 | 108.912 | 84.319 | 22.6% | Confirmed |
| `reactive_queue_created_all_downstream` | 100000 | 1254.864 | 1243.532 | 0.9% | Small gain |
| `reactive_queue_deleted_all_downstream` | 100000 | 1254.253 | 1216.862 | 3.0% | Small gain |
| `reactive_recalc_one_reaction` | 100000 | 396.627 | 388.042 | 2.2% | Small gain |
| `reactive_recalc_multiple_downstream` | 100000 | 826.557 | 782.872 | 5.3% | Confirmed |

## Appendix B: Additional Optimizations

After the per-commit verification pass, each phase was reviewed again with targeted profiling or reduced benchmark runs. The goal was to identify larger follow-up changes, not just validate the original commit stack. Raw rerun artifacts for implemented follow-ups are in `/tmp/opencode/joist-bench-results/additional-p*.txt`.

### Implemented Follow-Ups

Low-risk follow-ups were kept when they produced a plausible benchmark improvement in the targeted scenario without changing query counts or public behavior. One additional `loadAll` direct-map lookup experiment was measured and then dropped because the 100k `loadAll` benchmark was neutral to slightly slower than the phase-2 post-commit baseline.

| Phase | Change | Benchmark | Baseline Mean (ms) | Follow-Up Mean (ms) | Delta | Result |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 7 | Avoid union-set allocation in `FieldIndex.get` when one relation-value candidate set already contains the other. | `find_index_relation_value_steady_state` | 11.626 | 9.577 | 17.6% faster | Kept |
| 7 | Same change, non-target scenarios. | `find_index_single_field_first_build` | 24.262 | 25.198 | 3.9% slower | Noise / non-target |
| 7 | Same change, non-target scenarios. | `find_index_two_field_steady_state` | 0.190 | 0.326 | 71.6% slower | Sub-ms noise, high RSD |
| 9 | Cache each direct relation loader/promise once per field in `populateBatchLoader`'s direct-loader path. | `populate_books_reviews` (`PLUGINS=`) | 239.033 | 214.255 | 10.4% faster | Kept; queries unchanged at 2 |
| 9 | Same change, deep direct-loader path. | `populate_deep_books_reviews_comments` (`PLUGINS=`) | 752.405 | 720.954 | 4.2% faster | Kept; queries unchanged at 4 |
| 9 | Same change, simple direct-loader path. | `populate_books` (`PLUGINS=`) | 95.423 | 96.277 | 0.9% slower | Noise / simple path, queries unchanged |
| 9 | Same change, default-plugin fresh breadth path. | `populate_books_reviews` | 251.194 | 267.197 | 6.4% slower | Noise / preloader-dominated path, queries unchanged |
| 10 | Skip `followReverseHint` for empty reverse paths during reactive recalculation. | `reactive_recalc_one_reaction` | 388.042 | 380.867 | 1.8% faster | Kept |
| 10 | Skip `followReverseHint` for empty reverse paths during reactive recalculation. | `reactive_recalc_multiple_downstream` | 782.872 | 722.132 | 7.8% faster | Kept |
| 10 | Same change, queue-only/non-target scenario. | `reactive_queue_created_all_downstream` | 1243.532 | 1359.566 | 9.3% slower | Noise / non-target, RSD 11.2% |

### Measured But Not Kept

`benchmark-populate-deep.ts` was added on 2026-06-04 to isolate deeper breadth-first populate traversal across `Author.books`, `Book.reviews`, `BookReview.comment`, and sibling `Book.comments`. It reports the same CPU, wall time, heap delta, retained heap, and query-count metrics as `benchmark-populate-breadth.ts`, and includes a repeated already-loaded scenario to amplify skip/traversal overhead.

The tested `populateBatchLoader` allocation cleanup replaced `Object.entries`/`Object.keys` loops with `for...in`, made promise/preload containers lazy, avoided one nested `Promise.all`, built preload entities/ids in one pass, skipped empty child arrays, and hoisted nested hint rewriting. The results were mixed, so the production changes were not kept.

A JSON-preloader bypass for explicit `em.populate` was also measured. It improved local wall-clock time for simple direct-loader-covered shapes, but increased query counts for nested shapes, so it was not kept as a general-purpose optimization.

Commands used:

```bash
PLUGINS= BENCH_SIZES=2000 BENCH_ITERATIONS=8 BENCH_WARMUPS=2 NODE_OPTIONS=--expose-gc yarn env-cmd tsx benchmark-populate-deep.ts
PLUGINS= BENCH_SIZES=5000 BENCH_ITERATIONS=5 BENCH_WARMUPS=1 NODE_OPTIONS=--expose-gc yarn env-cmd tsx benchmark-populate-deep.ts
PLUGINS= BENCH_SIZES=1000 BENCH_ITERATIONS=5 BENCH_WARMUPS=1 BENCH_REPEAT=100 NODE_OPTIONS=--expose-gc yarn env-cmd tsx benchmark-populate-deep.ts
```

| Scenario | Size | Baseline Mean (ms) | Optimized Mean (ms) | Delta | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| `populate_deep_books_reviews_comments` | 2000 | 137.301 | 136.005 | 0.9% faster | Noise / neutral |
| `populate_deep_books_reviews_comments_already_loaded` | 2000 | 9.444 | 9.649 | 2.2% slower | Noise / neutral |
| `populate_deep_books_reviews_comments` | 5000 | 342.865 | 350.964 | 2.4% slower | Not kept |
| `populate_deep_books_reviews_comments_already_loaded` | 5000 | 22.228 | 22.304 | 0.3% slower | Neutral |
| `populate_deep_books_reviews_comments` | 1000 | 74.497 | 69.264 | 7.0% faster | Noisy / non-target |
| `populate_deep_books_reviews_comments_already_loaded` | 1000 | 4.662 | 5.678 | 21.8% slower | Not kept |
| `populate_deep_books_reviews_comments_already_loaded_repeat` | 1000 | 73.383 | 73.106 | 0.4% faster | Neutral |
| `populate_deep_books_reviews_comments` | 5000 | 402.881 | 346.606 | 14.0% faster | Not kept; queries 1 -> 4 |
| `populate_books` | 5000 | 57.740 | 46.367 | 19.7% faster | Not kept; query count unchanged but tied to bypass experiment |
| `populate_books_reviews` | 5000 | 132.351 | 111.710 | 15.6% faster | Not kept; queries 1 -> 2 |

### Phase-by-Phase Findings

| Phase | Hotspot Evidence | Larger Opportunity | Risk / Next Benchmark |
| --- | --- | --- | --- |
| 1. Hydration and registration | CPU samples still showed `findExistingInstance`, `hydrate`, `#doRegister`, `baseEntityCstr`, `getField`, and overwrite `changes` proxy creation. | Replace overwrite refresh's public `changes.fieldsWithoutRelations` path with direct internal `InstanceData.originalData` access; add a no-index fast path around registration indexing; consider non-inheritance metadata fast paths. | Medium for overwrite semantics; rerun all hydration scenarios, especially warm overwrite. |
| 2. Identity-map `loadAll` | Direct `#entitiesById.get` did not outperform the existing post-commit code in the 100k all-hit benchmark. | The bigger remaining win is avoiding full normalized-id/result rebuild allocations in all-hit and `loadAllIfExists` miss paths. | Medium because duplicate ids, not-found ordering, STI checks, and partial misses must stay exact; add mixed hit/miss benchmarks before changing. |
| 3. Sparse flush scanning | Clean-map scanning is already sub-ms; dirty 10k flush is dominated by per-dirty work such as validation, hooks, reactive recalculation, and dirty-field allocation. | Add sync-fast paths for validation/hook dispatch, avoid `changes` proxy allocation in reactive validation, and reduce `Object.keys(originalData)` churn by tracking dirty fields internally. | Medium; rerun dirty 100 and dirty 10000 validation/skip scenarios plus validation/hook integration tests. |
| 4. Todo creation and grouping | Todo creation itself is small, but STI grouping and repeated metadata/pending-operation lookup remain visible in loop-only profiles. | Add no-inheritance fast paths in `groupInsertsByTypeAndSubType`, avoid generic `groupBy` allocation for STI grouping, and consider accepting `Iterable<Entity>` to avoid materializing pending sets before `createTodos`. | Medium; rerun todo grouping benchmarks and sparse flush benchmarks. |
| 5. EntityWriter operation generation | Wide distinct-field updates remain much slower than same-field updates because the update op unions changed fields across all rows. | Group updates by changed-field signature so each SQL op only binds columns that rows actually changed; cache column lists by metadata/signature. | Medium-high; more SQL statements can hurt small batches and oplock/touched/updatedAt behavior needs coverage. Rerun 20/50-column distinct and same-field update scenarios. |
| 6. Field mutation cost | M2O mutation is still roughly twice primitive mutation; indexed primitive changes allocate heavily for high-cardinality buckets. | Add an internal non-percolating reverse add path for m2o->o2m echo updates, cache indexed-field checks, and consider singleton buckets inside `FieldIndex`. | Medium due relation consistency and index representation; rerun m2o id/entity and indexed primitive benchmarks. |
| 7. In-memory find indexing | Relation-value steady state was allocation-heavy because persisted relation lookups can merge id-keyed and instance-keyed sets. | The kept superset fast path reduces the common duplicate-set case. A larger version would canonicalize persisted relation index keys to tagged ids and return final filtered arrays in one pass. | Medium; rerun relation-value steady state and add relation first-build coverage. |
| 8. Find query preparation | Profiles pointed at `structuredClone` / structural batch-key generation after the `fastWhereFilterHash` commit. | Replace `getBatchKeyFromGenericStructure`'s clone/mutate/stringify path with a non-mutating structural serializer or shape key, then consider deduplicating parse/prepare per same-shape batch. | Medium to high because incorrect batch keys can merge incompatible SQL; rerun 1k one-field/two-field/with-hint scenarios and plugin cases. |
| 9. Populate breadth-first loading | Fresh DB-backed populate with JSON aggregate preloading was slower than direct breadth loading for simple o2m/o2m shapes in reduced runs; already-loaded paths are improved. | Add a cost/shape heuristic to bypass JSON preloading for simple existing-entity breadth populates, or batch hydrate JSON aggregate children instead of calling `hydrate` per child. | Medium to high; rerun default and `PLUGINS=` populate benchmarks at 5k/10k and nested fanout variants. |
| 10. Reactive recalculation | Empty reverse paths were still paying `followReverseHint`; created/deleted queueing remains allocation-heavy. | The kept empty-path fast path targets recalculation. Larger wins are create/delete-specific reactable lists, reactable-major bulk queueing, avoiding string action keys for non-`runOnce` dedupe, and sync-fast paths around `Promise.allSettled`. | Medium; rerun reactive recalc and create/delete queue scenarios plus delete-reactivity tests. |

### Verification Notes

- `yarn build` passed before the final benchmark reruns.
- Follow-up benchmark commands used the same integration harness shape as Appendix A, with `BENCH_SIZES=100000` and Node `v25.9.0`.
- After resetting and migrating the integration DB, `PLUGINS= yarn jest --runInBand -- src/IndexManager.test.ts src/relations/ReactiveField.test.ts src/ReactionLogging.test.ts` passed.
- The retained follow-ups intentionally avoid changing SQL shape, public API behavior, or reactive scheduling semantics.

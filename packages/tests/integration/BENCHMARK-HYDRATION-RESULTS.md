# Hydration And Registration Benchmark Results

Command:

```bash
cd packages/tests/integration
../../../node_modules/.bin/env-cmd -f ../../../local.env -- node --expose-gc --import tsx -r tsconfig-paths/register benchmark-hydration-registration.ts
```

Environment:

- Node: `v25.9.0`
- `global.gc`: enabled
- Rows are synthetic in-memory rows; no SQL is executed by the benchmark body.
- Retained heap is measured after forced GC while each scenario result remains globally reachable.

## Scenarios

- `author_fresh_register`: `em.hydrate(Author, rows)` into a fresh EM, without scalar field reads.
- `author_fresh_register_scalar_reads`: fresh Author hydration plus reads of common scalar fields.
- `author_existing_no_overwrite`: initial Author hydrate, then duplicate hydrate with `overwriteExisting: false`.
- `author_existing_overwrite_cold_data`: initial Author hydrate, then duplicate hydrate with `overwriteExisting: true` before scalar fields are read.
- `author_existing_overwrite_warm_data`: initial Author hydrate, scalar reads, then duplicate hydrate with `overwriteExisting: true`.
- `task_sti_fresh_register`: `em.hydrate(Task, rows)` with alternating STI discriminator values.

## Raw Results

```csv
scenario,size,iterations,mean_ms,p50_ms,p90_ms,p99_ms,min_ms,max_ms,rsd,cpu_mean_ms,heap_delta_mb
author_fresh_register,10000,18,10.786,10.909,12.433,14.423,7.712,14.423,0.149,24.916,4.458
author_fresh_register_scalar_reads,10000,18,46.193,47.017,53.429,53.687,31.494,53.687,0.135,85.107,5.029
author_existing_no_overwrite,10000,18,16.066,13.230,24.168,24.801,10.566,24.801,0.311,34.182,4.456
author_existing_overwrite_cold_data,10000,18,14.276,13.765,17.011,17.419,10.046,17.419,0.143,34.482,4.454
author_existing_overwrite_warm_data,10000,18,41.393,41.649,44.969,45.782,33.802,45.782,0.065,92.554,5.030
task_sti_fresh_register,10000,18,14.232,12.295,21.513,24.729,9.882,24.729,0.312,31.181,4.521
author_fresh_register,50000,10,49.560,48.989,52.810,53.156,46.153,53.156,0.044,87.365,20.822
author_fresh_register_scalar_reads,50000,10,100.223,100.641,106.204,106.667,87.750,106.667,0.054,187.136,23.563
author_existing_no_overwrite,50000,10,69.540,63.837,77.688,112.197,61.102,112.197,0.215,110.517,20.821
author_existing_overwrite_cold_data,50000,10,73.938,67.373,72.675,124.513,63.424,124.513,0.231,116.188,20.813
author_existing_overwrite_warm_data,50000,10,181.339,183.980,192.428,196.835,156.296,196.835,0.065,306.016,23.561
task_sti_fresh_register,50000,10,62.680,52.489,86.822,89.511,48.577,89.511,0.251,98.783,21.158
author_fresh_register,100000,8,102.362,100.223,106.929,106.929,98.172,106.929,0.033,142.864,40.648
author_fresh_register_scalar_reads,100000,8,215.763,211.838,252.292,252.292,203.560,252.292,0.066,341.664,45.986
author_existing_no_overwrite,100000,8,156.538,150.298,193.889,193.889,143.478,193.889,0.094,244.757,40.642
author_existing_overwrite_cold_data,100000,8,238.585,235.141,290.569,290.569,192.690,290.569,0.140,500.551,40.649
author_existing_overwrite_warm_data,100000,8,388.272,377.051,420.030,420.030,368.370,420.030,0.042,629.628,45.987
task_sti_fresh_register,100000,8,118.582,104.335,159.260,159.260,102.556,159.260,0.191,160.004,41.309
```

## Findings

- Fresh Author hydration/register is about `102 ms` for `100k` rows, or roughly `1.02 us/entity` wall time.
- Fresh retained heap is about `40.6 MB` for `100k` Authors, or roughly `406 bytes/entity` for entities plus EM identity structures.
- Scalar field reads roughly double 100k Author time, from `102 ms` to `216 ms`, and add about `5.3 MB` retained heap. This is expected lazy serde/data materialization cost, not registration cost.
- Duplicate hydrate with `overwriteExisting: false` costs about `54 ms` incremental at `100k` rows after subtracting the initial fresh hydrate. This mostly isolates tagged-id construction plus `Map.get` identity lookup.
- Duplicate hydrate with `overwriteExisting: true` is materially more expensive at `100k`: about `136 ms` incremental for cold data and `172 ms` incremental for warm scalar data after subtracting comparable initial work.
- STI fresh hydration is about `16 ms` slower than non-inheritance Author hydration at `100k`, consistent with per-row subtype resolution via discriminator lookup.

## Optimization Candidates

- `EntityManager.hydrate`: hoist `const overwriteExisting = options?.overwriteExisting === true` outside the row loop. This is small but applies to every hydrated row.
- `EntityManager.hydrate`: avoid the second `Map.get` duplicate check in `#doRegister` for hydrate-created entities. The hydrate loop already called `findExistingInstance(taggedId)` immediately before `#doRegister`.
- `EntityManager.hydrate` / `#doRegister`: pass the already-known concrete `meta` into registration for hydrate-created entities, avoiding `getMetadata(entity)` per new row.
- `findConcreteMeta`: cache STI discriminator value to metadata lookup instead of `baseMeta.subTypes.find(...)` per row.
- `overwriteExisting` branch: hoist `const allFields = getMetadata(entity).allFields` outside the inner `Object.keys(data)` loop and skip `changedFields.includes(...)` when `changedFields.length === 0`.
- `keyToTaggedId`: benchmark an inline hydrate fast path using a precomputed `${tagName}:` prefix for non-null ids. This path is on every hydrate row and every duplicate lookup.

## Optimized Results

Optimizations applied:

- Hoisted `overwriteExisting` and tagged id prefix outside the hydration loop.
- Inlined hydrate tagged-id construction for the required `id` column.
- Passed known concrete metadata into `#doRegister` for hydrated entities.
- Skipped `#doRegister`'s duplicate `Map.get` check for hydrate-created entities.
- Cached CTI/STI subtype metadata lookups as lazy `EntityMetadata` getters.
- Hoisted overwrite branch field metadata lookup and skipped dirty-field checks when there are no changed scalar fields.

```csv
scenario,size,iterations,mean_ms,p50_ms,p90_ms,p99_ms,min_ms,max_ms,rsd,cpu_mean_ms,heap_delta_mb
author_fresh_register,10000,18,8.936,9.112,10.160,10.235,6.436,10.235,0.115,21.911,4.444
author_fresh_register_scalar_reads,10000,18,36.080,35.954,40.293,49.944,13.971,49.944,0.176,96.296,5.036
author_existing_no_overwrite,10000,18,10.842,10.103,15.243,18.896,7.827,18.896,0.229,25.194,4.450
author_existing_overwrite_cold_data,10000,18,11.668,10.333,20.415,21.023,7.022,21.023,0.342,28.096,4.454
author_existing_overwrite_warm_data,10000,18,32.620,33.756,36.129,36.601,20.187,36.601,0.115,74.525,5.031
task_sti_fresh_register,10000,18,12.154,10.388,16.499,16.952,8.031,16.952,0.253,26.682,4.522
author_fresh_register,50000,10,50.059,40.599,66.072,66.155,37.275,66.155,0.246,81.806,20.822
author_fresh_register_scalar_reads,50000,10,87.305,83.274,89.570,123.325,76.643,123.325,0.143,151.666,23.564
author_existing_no_overwrite,50000,10,51.627,50.731,52.804,57.844,48.704,57.844,0.048,88.110,20.820
author_existing_overwrite_cold_data,50000,10,51.753,52.213,52.992,53.235,49.172,53.235,0.026,80.285,20.822
author_existing_overwrite_warm_data,50000,10,139.033,134.255,153.363,167.538,116.318,167.538,0.100,247.733,23.563
task_sti_fresh_register,50000,10,65.138,65.049,66.585,67.506,63.124,67.506,0.020,96.622,21.158
author_fresh_register,100000,8,82.952,82.652,84.913,84.913,81.466,84.913,0.015,120.414,40.648
author_fresh_register_scalar_reads,100000,8,186.986,185.239,193.511,193.511,177.322,193.511,0.028,300.111,45.982
author_existing_no_overwrite,100000,8,109.782,108.463,113.833,113.833,106.949,113.833,0.019,153.448,40.647
author_existing_overwrite_cold_data,100000,8,144.013,139.682,163.068,163.068,129.471,163.068,0.072,231.694,40.649
author_existing_overwrite_warm_data,100000,8,307.113,304.494,357.644,357.644,276.904,357.644,0.069,527.859,45.984
task_sti_fresh_register,100000,8,88.207,87.530,91.965,91.965,85.497,91.965,0.026,129.975,41.309
```

## Before/After Summary

- `author_fresh_register` at `100k`: `102.362 ms` to `82.952 ms`, a `19.0%` wall-time reduction.
- `author_fresh_register_scalar_reads` at `100k`: `215.763 ms` to `186.986 ms`, a `13.3%` reduction. Most remaining time is lazy scalar serde/materialization.
- `author_existing_no_overwrite` at `100k`: `156.538 ms` to `109.782 ms`, a `29.9%` reduction. Incremental duplicate hydrate cost dropped from `54.176 ms` to `26.830 ms`, a `50.5%` reduction.
- `author_existing_overwrite_cold_data` at `100k`: `238.585 ms` to `144.013 ms`, a `39.6%` reduction. Incremental overwrite cost dropped from `136.223 ms` to `61.061 ms`, a `55.2%` reduction.
- `author_existing_overwrite_warm_data` at `100k`: `388.272 ms` to `307.113 ms`, a `20.9%` reduction. Incremental warm overwrite cost dropped from `172.509 ms` to `120.127 ms`, a `30.7%` reduction.
- `task_sti_fresh_register` at `100k`: `118.582 ms` to `88.207 ms`, a `25.6%` reduction. STI overhead over non-inheritance fresh hydration dropped from `16.220 ms` to `5.255 ms`.

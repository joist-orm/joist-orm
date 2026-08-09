---
title: Exact Columns
description: Learning each endpoint's used columns to narrow SELECTs
sidebar:
  order: 16
---

Joist normally issues `SELECT a.*` when loading entities, because it can't statically know which getters your code will call later.

The `ExactColumnsPlugin` is an opt-in plugin that learns this at runtime: it observes which fields each endpoint actually reads, and then narrows that endpoint's SELECTs to only the used columns, i.e. skipping wide `jsonb`/`text` columns an endpoint never touches (and just any column that is not actively read by the endpoint).

## Setup

Create one plugin for your whole app, register it on every `EntityManager`, and wrap each endpoint in `exactColumns.track`:

```typescript
import { ExactColumnsPlugin } from "joist-orm";

// One plugin app-wide, i.e. in a top-level module
export const exactColumns = new ExactColumnsPlugin();

// Use a stable key for the operation/query structure.
app.get("/authors/:id", (req, res) =>
  exactColumns.track("GET /authors/:id", async () => {
    // Create a fresh EntityManager on each attempt, including the retry.
    const em = new EntityManager(ctx, { driver });
    em.addPlugin(exactColumns);
    // ...load & serve authors...
  }),
);
```

If your application creates the `EntityManager` in middleware, `track` must wrap that middleware as well as the endpoint handler. Its callback must await the downstream work and be able to re-run both EM creation and the handler on a retry. The order is `track -> create EM and register plugin -> handler`, with a fresh EM for each attempt, not just each request.

## How it works

The plugin uses two modes, learning and narrowed, with self-healing returning it to learning:

1. **Learning**: each endpoint starts with Joist's usual `SELECT a.*`, while the plugin records all actually-read fields.

   Initially, after three consecutive successful invocations add no newly-observed fields, the profile is considered stable.

2. **Narrowed**: stable profiles replace `a.*` with an explicit column list: the used fields, plus the primary key and the `createdAt`/`updatedAt`/`deletedAt` columns (which flushing and soft-deletes rely on).

3. **Self-healing**: if a novel codepath reads a field whose column wasn't fetched, Joist throws a `MissingColumnError` instead of returning a misleading `undefined`.

   The top-level `track` catches it, falls back to "learning mode", and retries once with full rows.

Ideally these


The auto-retry only happens if the invocation hasn't flushed yet — a missing-column error *after* a committed `em.flush` propagates (failing that one request) rather than re-executing the committed writes, and the widened profile still fixes the next invocation. A missing-column error *during* a flush aborts that flush's transaction, so nothing commits and the retry stays safe.

```typescript
const plugin = new ExactColumnsPlugin({
  // Log the specific entity and field that caused a missing-column error
  onMissingColumn: (err) => log.info(`Widening ${err.endpointKey} for ${err.entity}.${err.fieldName}`),
});
```

:::info[Tip]

Joist uses a JIT-style optimization/deopt algorithm: each invocation that hits a missing-column error increases the settling threshold, up to a limit. Sustained clean narrowed calls gradually reduce it.

This lets us initially aggressively optimize/narrow with the assumption most endpoints are stable, but then automatically progressively back off for dynamic endpoints, all without any tedious/brittle manual configuration.

:::

## Metrics

Three high-level metrics describe whether exact columns is useful for your traffic:

| Question | Metric | Definition |
| --- | --- | --- |
| How often does it help? | Requests optimized % | Requests that removed columns in at least one supported query preparation / all tracked requests |
| How often does it cause extra work? | Requests retried % | Requests that triggered a retry due to a missing-column error / all tracked requests |
| How much does it trim? | Columns avoided % | Columns omitted / columns before narrowing, summed across supported query preparations |

In the above table, a request means one `track()` invocation, so an optimized request (that missed a column) can also be a retried request.

### Reporting outcomes

To report these metrics, configure `opts.onTrack(outcome)` when creating the plugin.

It runs once when the original `track()` call completes, including errors and retry failure, and summarizes both attempts if a retry occurs.

The callback is synchronous: enqueue telemetry rather than return a promise. Synchronous callback errors are ignored; rejected promises are not caught by the plugin.

The exported `ExactColumnsTrackOutcome` has these readonly fields:

| Field | Meaning |
| --- | --- |
| `endpointKey: string` | The stable key passed to `track()`. |
| `optimized: boolean` | Whether any columns were removed in a supported query preparation. |
| `retried: boolean` | Whether a retry due to a missing-column error started, regardless of whether it succeeded. |
| `missingColumnFailure: boolean` | Whether committed writes prevented a retry due to a missing-column error, not whether a retry failed. |
| `columnsBefore: number` | Non-lazy mapped primary columns before narrowing in supported non-inheritance operations, including learning and retry attempts. |
| `columnsOmitted: number` | Columns removed from those projections. |

Column counts measure `beforeFind` observations, not executed SQL: find batching and caching may combine or skip execution. Each column counts once per observed preparation, not once per returned row. Coverage is limited to supported loaders; inheritance, other operations, and preloaded joins are excluded. Learning and full-row retries contribute to `columnsBefore` but not `columnsOmitted`. These are not savings across all database traffic.

For DogStatsD, use your application's existing `statsd` client (`hot-shots`-style `increment` API). Replace the app-wide plugin creation from Setup with:

```typescript
export const exactColumns = new ExactColumnsPlugin({
  onMissingColumn: (err) => log.info(`Widening ${err.endpointKey} for ${err.entity}.${err.fieldName}`),
  onTrack: (outcome) => {
    const tags = [`endpoint:${outcome.endpointKey}`];
    statsd.increment("joist.exact_columns.requests", 1, tags);
    statsd.increment("joist.exact_columns.optimized", outcome.optimized ? 1 : 0, tags);
    statsd.increment("joist.exact_columns.retries", outcome.retried ? 1 : 0, tags);
    statsd.increment("joist.exact_columns.missing_column_failures", outcome.missingColumnFailure ? 1 : 0, tags);
    statsd.increment("joist.exact_columns.columns_before", outcome.columnsBefore, tags);
    statsd.increment("joist.exact_columns.columns_omitted", outcome.columnsOmitted, tags);
  },
});
```

Use stable endpoint keys such as `GET /authors/:id`, never actual IDs. At graceful shutdown, let requests finish and flush your metrics client.

In Datadog, use these count queries, optionally grouping each by `endpoint`:

```text
a = sum:joist.exact_columns.requests{*}.as_count()
b = sum:joist.exact_columns.optimized{*}.as_count()
c = sum:joist.exact_columns.retries{*}.as_count()
d = sum:joist.exact_columns.columns_omitted{*}.as_count()
e = sum:joist.exact_columns.columns_before{*}.as_count()
```

- Requests optimized %: `100 * b / a`
- Requests retried %: `100 * c / a`
- Columns avoided %: `100 * d / e`

Calculate each rate from summed counts over the same window, not by averaging per-request, per-process, or per-endpoint percentages. Leave zero-denominator intervals as no data. All counts for an invocation are reported at completion.

Monitor `sum:joist.exact_columns.missing_column_failures{*}.as_count()` separately as a safety signal, ideally zero. Keep `onMissingColumn` for logging the specific entity and field, not counting retries: it runs before the plugin decides whether to retry or fail.

## Requirements & caveats

- **Entity reads must happen inside the tracked callback.** Return response data rather than entities that will be read after `track()` returns; reads outside the scope do not contribute to the profile and cannot trigger a retry.
- **Each `track` invocation must create its own `EntityManager`** (the usual per-request pattern). A retry due to a missing-column error re-invokes your whole function, and an `EntityManager` whose flush aborted is not reusable; similarly, one `EntityManager` must not span two `track` scopes.
- **Pre-flush retries re-run your endpoint**: database writes are protected automatically (no retry after a committed flush, per above), but Joist can't see non-database side effects — an email or queue publish performed *before* a missing-column error will re-run on the retry. Keep such effects after your reads (or idempotent), or accept the rare one-time-per-branch repeat. Aggregate `onTrack`'s `retried` and `missingColumnFailure` outcomes to see how often either path fires.
- **Profiles are in-memory**, so each process restart re-learns from scratch. Stable endpoints narrow after the initial field-discovery invocation and three no-growth observations.
- Don't swallow `MissingColumnError` in broad `try/catch`es — re-reads keep throwing (the value is never cached), and `track` needs to see the error to widen the profile.

## What is (and isn't) narrowed

Narrowing applies to `em.load`/`em.loadAll`, `em.find` and friends, and `o2m`/`o2o` relation loads. Some operations always fetch full rows, because their correctness depends on it:

- Entities using [single-](/advanced/single-table-inheritance) or [class-table inheritance](/advanced/class-table-inheritance)
- `em.findByUnique`, `em.refresh`, m2m/recursive/lens loads
- [Lazy columns](/modeling/fields#lazy-columns) stay excluded from SELECTs exactly as without the plugin, and are still fetched on-demand via `.load()`

Every unused column is pruned — primitives, enums, and foreign keys alike; only primary key and timestamp columns are always fetched.

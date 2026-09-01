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

// In your EntityManager factory
const em = new EntityManager(ctx, { driver });
em.addPlugin(exactColumns);

// Per endpoint, with a stable key for the operation/query structure
app.get("/authors/:id", (req, res) =>
  exactColumns.track("GET /authors/:id", async () => {
    // ...load & serve authors...
  }),
);
```

## How it works

1. **Learning**: each key starts with Joist's usual `SELECT a.*`, while the plugin records the union of fields actually read (per entity type, per endpoint/key). After three consecutive invocations add no fields, the profile is considered stable.
2. **Narrowing**: stable profiles replace `a.*` with an explicit column list: the used fields, plus the primary key and the `createdAt`/`updatedAt`/`deletedAt` columns (which flushing and soft-deletes rely on). Foreign keys are tracked like any other field — traversing a relation reads its FK, so relations you use keep their columns.
3. **Self-healing**: if a novel codepath reads a field whose column wasn't fetched, Joist throws a `StaleColumnUsageError` instead of returning a misleading `undefined`. The top-level `track` catches it, widens the profile, retries once with full rows, and returns the key to learning mode. Repeated stales increase the required stable observations from 3 to 5, 8, 13, 21, and at most 34; 100 clean narrowed invocations remove one instability level. This JIT-style optimize/deopt loop lets common paths narrow quickly while variable paths back off automatically, without requiring input-aware keys or configuration.

The auto-retry only happens if the invocation hasn't flushed yet — a stale *after* a committed `em.flush` propagates as an error (failing that one request) rather than re-executing the committed writes, and the widened profile still fixes the next invocation. A stale *during* a flush aborts that flush's transaction, so nothing commits and the retry stays safe.

```typescript
const plugin = new ExactColumnsPlugin({
  // Telemetry for stale hits, i.e. to log or count novel codepaths
  onStale: (err) => log.info(`Widening ${err.endpointKey} for ${err.fieldName}`),
});

// Introspection, i.e. `{ "GET /authors/:id": { mode, stableRuns, staleRetries, entities } }`
plugin.getReport();
```

## Requirements & caveats

- **Each `track` invocation must create its own `EntityManager`** (the usual per-request pattern). The stale-retry re-invokes your whole function, and an `EntityManager` whose flush aborted is not reusable; similarly, one `EntityManager` must not span two `track` scopes.
- **Pre-flush retries re-run your endpoint**: database writes are protected automatically (no retry after a committed flush, per above), but Joist can't see non-database side effects — an email or queue publish performed *before* a stale hit will re-run on the retry. Keep such effects after your reads (or idempotent), or accept the rare one-time-per-branch repeat. `getReport()`'s `staleRetries`/`staleFailures` counters show how often either path fires.
- **Profiles are in-memory**, so each process restart re-learns from scratch. Stable endpoints narrow after the initial field-discovery invocation and three no-growth observations.
- Don't swallow `StaleColumnUsageError` in broad `try/catch`es — re-reads keep throwing (the value is never cached), and `track` needs to see the error to widen the profile.

## What is (and isn't) narrowed

Narrowing applies to `em.load`/`em.loadAll`, `em.find` and friends, and `o2m`/`o2o` relation loads. Some operations always fetch full rows, because their correctness depends on it:

- Entities using [single-](/advanced/single-table-inheritance) or [class-table inheritance](/advanced/class-table-inheritance)
- `em.findByUnique`, `em.refresh`, m2m/recursive/lens loads
- [Lazy columns](/modeling/fields#lazy-columns) stay excluded from SELECTs exactly as without the plugin, and are still fetched on-demand via `.load()`

Every unused column is pruned — primitives, enums, and foreign keys alike; only primary key and timestamp columns are always fetched.

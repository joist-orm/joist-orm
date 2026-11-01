---
title: Entity Metrics
description: Optional request-level calculation and validation statistics
---

`EntityMetrics` collects invocation counts and total elapsed milliseconds for reactive fields,
AsyncMethods, validation rules, commit rules, and reactions. They can be very useful for tracking production
metrics for both preventing and investigating performance issues.

## Usage

Create an `EntityMetrics` collector per request, and attach it to the request's `EntityManager`, then
use the `snapshot` method to publish the metrics after the request is complete:

```ts
import { EntityMetrics } from "joist-orm";

const metrics = new EntityMetrics();
em.setMetrics(metrics);

try {
  await handleRequest(em); // Can calculate values and flush multiple times.
} finally {
  publishRequestMetrics(metrics.snapshot());
}
```

Snapshots contain named statistics:

```ts
{
  evaluations: [
    { name: "Author.numberOfBooks", count: 12, totalMillis: 3.42 },
    { name: "Author.addRule(Author.ts:86)", count: 8, totalMillis: 1.27 },
  ],
}
```

## Reporting

For example, use [`hot-shots`](https://github.com/brightcove/hot-shots) to send the snapshot to
Datadog's DogStatsD agent:

```ts
import StatsD from "hot-shots";
import type { EntityMetricsSnapshot } from "joist-orm";

const statsd = new StatsD({ host: process.env.DD_AGENT_HOST ?? "127.0.0.1" });

/** Publishes one completed request's statistics to Datadog. */
function publishRequestMetrics(snapshot: EntityMetricsSnapshot): void {
  for (const stat of snapshot.evaluations) {
    const tags = [`stat:${stat.name}`];
    statsd.increment("joist.evaluations.count", stat.count, tags);
    statsd.distribution("joist.evaluations.total_ms", stat.totalMillis, tags);
  }
}
```

The `total_ms` distribution contains one total per name per request, i.e. if `Author.numberOfBooks`
is calculated for 10 authors, and 3x per author, `total_ms` will be the sum of all 30 invocations.

The `count` metric is the number of times the stat's value is _calculated_, not necessarily accessed,
i.e. most Joist reactive features cache their lambda's calculated values, if/until there is an entity
mutation that makes them dirty, and these cached accesses are very cheap, so are not included in
either `count` or `total_ms`.

# Design Doc: Static Hint-Based Caches for Joist

## Status

Draft

## Summary

Add a new top-level `createCache` API that lets applications define caches as **static, typed views of Joist entities**.

The cache:

- is defined with a **schema tree** that pairs entity constructors with `JsonHint`s
- loads from arbitrary Joist queries/lists in a user-provided `load` function
- stores a **serialized snapshot** in memory and optionally a backend like Redis
- returns **readonly POJOs**, not live entities
- can optionally run a one-time **sync projection** to build derived in-memory indexes
- relies entirely on a **freshness/version key** supplied by the caller
- does **not** do any write-path invalidation or instrumentation in v1

This is intended to replace bespoke patterns like `DataCache` + handwritten POJO conversion + handwritten `JsonBinding` schemas + secondary derived caches.

---

## Motivation

The current handwritten caching approach requires a lot of manual work:

1. Defining cache keys and versioning
2. Loading entities via `em.find`/`em.populate`
3. Manually extracting entity data into cache-safe POJOs
4. Defining `JsonBinding` schemas for serialization
5. Deserializing JSON back into domain-shaped values
6. Building secondary in-memory indexes (`Map`, `Set`, sorted lists, grouped lookups)

This is repetitive and pushes app code below the right abstraction level.

Joist already has most of the pieces needed for a better DX:

- `JsonHint` / `toJSON` for entity-to-payload conversion
- `em.populate` for loading entity subgraphs
- entity metadata + serdes for domain-aware field serialization
- tagged ids and domain types like `Temporal`

What is missing is a first-class way to say:

> "Cache this snapshot of Joist data, typed like a Joist view, but returned as static POJOs."

---

## Goals

### Primary goals

1. **`toJSON`-style DX for cache shape definition.** Entity subtrees use `JsonHint` syntax, paired with their entity constructor. Users should not need to write manual serialization schemas.

2. **Static cached views.** Returned values are plain readonly POJOs, not entities and not EM-backed.

3. **Arbitrary query/list loads.** The `load` function can return entities, entity arrays, and wrapper objects containing entities mixed with non-entity domain values.

4. **Domain-aware rehydration.** Entity fields should round-trip through cache storage and come back as proper domain values: tagged ids, `Temporal`, `Date`, `bigint`, enum codes.

5. **One-time in-memory projection.** A sync `project` step turns stored cache data into richer in-memory structures: `byId` maps, sorted lists, `Set`s, grouped lookups.

6. **Shared identity.** Multiple reads of the same cache key in one process return the same in-memory object identity until eviction.

7. **Minimal v1 semantics.** Freshness is entirely key-based. No write-path invalidation. No automatic instrumentation. Just `.get`.

### Secondary goals

8. **Sits above the ORM layer.** This is a top-level `createCache` helper, not part of `EntityManager` or entity instances.

9. **Simple public type.** Users care about two types: the key type and the projected result type, i.e. `Cache<KeyType, ResultType>`. The internal coordination between `load`, `data`, and `project` is an implementation detail.

---

## Non-Goals

1. **No automatic invalidation in v1.** No `afterCommit`, plugin, or reactive write tracking.
2. **No write-through / eager refresh.** Writes do not update or clear caches.
3. **No correctness guarantees beyond the key.** Stale key = stale data.
4. **No live entity behavior.** Cached results don't support `.get`, `.load`, `.populate`, hooks, or EM interactions.
5. **No full arbitrary JS serialization.** Non-JSON structures like `Map`/`Set` belong in `project`, not in stored payloads.
6. **No manual `.delete` or `.clear`.** The intended invalidation mechanism is changing the key.

---

## Core idea

A cache entry has **three representations**:

```
load result         →  stored payload       →  materialized view
(live entities)        (JSON-safe snapshot)     (readonly POJOs + projections)
```

1. **Load result** — returned by user `load(...)`. May include entities, arrays, wrapper objects, and domain values like `Temporal`.

2. **Stored payload** — JSON-safe, serialized snapshot suitable for Redis and in-memory storage. Built by applying `toJSON` to entity nodes and serde-aware serialization to scalar nodes.

3. **Materialized view** — the object returned from `.get(...)`. Domain types restored via serdes. Optional `project(...)` applied. Shared and readonly in memory.

---

## Proposed API

### Full example

```ts
import { createCache, entities, scalar } from "joist-orm/cache";

const authorsCache = createCache({
  name: "authors",
  version: "1",

  key(args: { tenantId: string; freshness: string }) {
    return [args.tenantId, args.freshness];
  },

  data: {
    authors: entities(Author, {
      id: true,
      firstName: true,
      lastName: true,
      publisher: { id: true, name: true },
      fullName: (a) => `${a.firstName} ${a.lastName}`,
    }),
    generatedAt: scalar<Temporal.ZonedDateTime>(),
  },

  async load(args) {
    return {
      authors: await args.em.find(Author, { tenant: args.tenantId }),
      generatedAt: nowUTC(),
    };
  },

  project(data) {
    return {
      authors: data.authors,
      authorsById: indexBy(data.authors, (a) => a.id),
      authorsSorted: [...data.authors].sort((a, b) =>
        a.lastName.localeCompare(b.lastName),
      ),
      generatedAt: data.generatedAt,
    };
  },
});
```

### Reading from the cache

```ts
const result = await authorsCache.get({
  em,
  tenantId: "t:1",
  freshness: tenant.updatedAt.toString(),
});

// result.authors       — readonly cached Author POJOs
// result.authorsById   — Map<AuthorId, CachedAuthor>
// result.authorsSorted — sorted CachedAuthor[]
// result.generatedAt   — Temporal.ZonedDateTime
```

### Public type

From the user's perspective, the cache is:

```ts
Cache<
  { em: EntityManager; tenantId: string; freshness: string },
  {
    authors: readonly CachedAuthor[];
    authorsById: Map<AuthorId, CachedAuthor>;
    authorsSorted: readonly CachedAuthor[];
    generatedAt: Temporal.ZonedDateTime;
  }
>
```

The intermediate types (load result shape, stored payload shape) are implementation details users don't need to name.

---

## The `data` schema tree

The `data` object is a **static schema tree** that serves two purposes:

1. **Compile-time**: provides type-checked pairing of entity types to `JsonHint`s
2. **Runtime**: provides entity metadata + hint info needed to serialize and rehydrate cached payloads (even on cache hits, when `load` is not called)

### Entity nodes

```ts
entities(Author, { id: true, firstName: true, books: { title: true } })
entity(Publisher, { id: true, name: true })
```

These reuse the `toJSON` pattern: the entity constructor establishes the root type, and the `JsonHint<T>` is type-checked against it.

- `entities(Cstr, hint)` — the load result for this key must be `T[]`
- `entity(Cstr, hint)` — the load result for this key must be `T`

At runtime, the constructor provides access to entity metadata for serde-aware serialization and rehydration.

### Scalar nodes

For non-entity domain values that need serde-aware round-tripping:

```ts
scalar<Temporal.ZonedDateTime>()
```

Scalar nodes handle values like `Temporal.ZonedDateTime`, `Date`, `bigint`, etc. that are not JSON-native but need to survive a Redis round-trip.

For plain JSON-native values (strings, numbers, booleans), `scalar` could be optional or inferred.

### Why `data` is separate from `load`

On a **cache hit**, `load` is never called. The cache still needs to know:

- which keys in the stored payload are entity arrays vs. scalars
- which entity metadata + hint to use for rehydration
- which serdes to apply for domain value restoration

`data` provides this static schema so that rehydration works without re-running `load`.

---

## How typing works

### The chain

```
data: S         →   load returns Raw<S>   →   project receives Materialized<S>   →   .get returns R
(schema tree)       (live entities)            (cached POJOs)                         (projected result)
```

### `Raw<S>` — what `load` must return

Each `data` node maps to a raw/live type:

| data node | Raw type |
|---|---|
| `entities(Author, hint)` | `Author[]` |
| `entity(Author, hint)` | `Author` |
| `scalar<T>()` | `T` |
| nested `{ a: ..., b: ... }` | `{ a: Raw<...>, b: Raw<...> }` |

### `Materialized<S>` — what `project` receives

Each `data` node maps to a cached/rehydrated type:

| data node | Materialized type |
|---|---|
| `entities(Author, H)` | `readonly JsonPayload<Author, H>[]` |
| `entity(Author, H)` | `JsonPayload<Author, H>` |
| `scalar<T>()` | `T` |
| nested `{ a: ..., b: ... }` | `{ readonly a: Materialized<...>, readonly b: Materialized<...> }` |

Entity payloads reuse Joist's existing `JsonPayload<T, H>` type, which already handles:

- primitives → as-is
- enums → code strings
- m2o with empty hint → id string
- m2o with nested hint → nested payload
- o2m/m2m with `true` or empty → id arrays
- o2m/m2m with nested hint → payload arrays
- custom lambda keys → return type of the lambda

### `R` — what `.get` returns

If `project` is provided, `R` is its return type.

If `project` is omitted, `R` defaults to `Materialized<S>`.

### What users see

Users only interact with two types:

- **Key type** — the argument to `.get(...)`
- **Result type** — the return of `.get(...)`

The intermediate `S`, `Raw<S>`, and `Materialized<S>` are inferred, never named.

---

## Type-level sketch

```ts
// Opaque descriptors — users don't interact with these types directly
type EntityDescriptor<T extends Entity, H> = { __brand: "entity"; cstr: EntityConstructor<T>; hint: H };
type EntitiesDescriptor<T extends Entity, H> = { __brand: "entities"; cstr: EntityConstructor<T>; hint: H };
type ScalarDescriptor<T> = { __brand: "scalar" };

// Constructor functions
function entity<T extends Entity, const H extends JsonHint<T>>(
  cstr: EntityConstructor<T>, hint: H
): EntityDescriptor<T, H>;

function entities<T extends Entity, const H extends JsonHint<T>>(
  cstr: EntityConstructor<T>, hint: H
): EntitiesDescriptor<T, H>;

function scalar<T>(): ScalarDescriptor<T>;

// Mapping from schema tree to raw/live types
type Raw<S> =
  S extends EntitiesDescriptor<infer T, any> ? T[] :
  S extends EntityDescriptor<infer T, any> ? T :
  S extends ScalarDescriptor<infer T> ? T :
  S extends object ? { [K in keyof S]: Raw<S[K]> } :
  S;

// Mapping from schema tree to materialized/cached types
type Materialized<S> =
  S extends EntitiesDescriptor<infer T, infer H> ? readonly JsonPayload<T, H>[] :
  S extends EntityDescriptor<infer T, infer H> ? JsonPayload<T, H> :
  S extends ScalarDescriptor<infer T> ? T :
  S extends object ? { readonly [K in keyof S]: Materialized<S[K]> } :
  S;

// The cache itself
type Cache<K, R> = {
  get(args: K): Promise<Readonly<R>>;
};

// The factory
function createCache<K, S, R = Materialized<S>>(opts: {
  name: string;
  version: string;
  key(args: K): readonly unknown[];
  data: S;
  load(args: K): Promise<Raw<S>>;
  project?: (data: Materialized<S>) => R;
  memory?: { maxEntries?: number };
  backend?: CacheBackend;
  /** TTL in seconds passed to backend.set. For storage hygiene, not invalidation. */
  ttlSeconds?: number;
}): Cache<K, R>;
```

---

## Examples

### Simple: single entity list, no projection

```ts
const booksCache = createCache({
  name: "books",
  version: "1",
  key: ({ authorId }: { authorId: string }) => [authorId],
  data: entities(Book, { id: true, title: true }),
  async load({ em, authorId }) {
    return em.find(Book, { author: authorId });
  },
});

// Type: Cache<{ em; authorId }, readonly { id: BookId; title: string }[]>
const books = await booksCache.get({ em, authorId: "a:1" });
```

### Wrapper with projection

```ts
const pricingCache = createCache({
  name: "pricing",
  version: "3",

  key({ pofId, rpavId, freshness }: PricingCacheArgs) {
    return [pofId, rpavId, freshness];
  },

  data: {
    tlivs: entities(TakeoffLineItemVersion, {
      id: true,
      slotId: true,
      locationId: true,
      quantity: true,
      totalCostInCents: true,
      options: { id: true, name: true, groupId: true },
    }),
    baseHouseCost: scalar<number>(),
    baseHousePrice: scalar<number>(),
  },

  async load(args) {
    return {
      tlivs: await loadTlivs(args.em, args.pofId, args.rpavId),
      baseHouseCost: await calcBaseHouseCost(args.em, args.pofId),
      baseHousePrice: await calcBaseHousePrice(args.em, args.pofId),
    };
  },

  project(data) {
    return {
      ...data,
      scopeByLastOption: buildScopeByLastOption(data.tlivs),
    };
  },
});
```

### Root is a single entity list (no wrapper)

When `data` is directly an `entities(...)` or `entity(...)` descriptor (not a wrapper object), the `load` function returns the entities directly:

```ts
const authorsCache = createCache({
  name: "allAuthors",
  version: "1",
  key: ({ freshness }: { freshness: string }) => [freshness],
  data: entities(Author, { id: true, firstName: true }),
  async load({ em }) {
    return em.find(Author, {});
  },
  project(authors) {
    return {
      list: authors,
      byId: indexBy(authors, (a) => a.id),
    };
  },
});
```

---

## Storage semantics

### Key model

The full storage key is:

```
${name}:${version}:${serializeKey(key(args))}
```

- `version` is for **schema/shape changes** across deploys
- `key(args)` encodes all **data freshness**
- the same full key is assumed to be **permanently valid**
- v1 never tries to decide if a key is stale

This is a major simplification versus the existing `DataCache`:

- no `pushedAt` timestamps
- no "is Redis newer than memory?" checks
- no delete-on-write
- no external invalidation signals

Cache keys are effectively **content-addressed snapshots**.

---

## Runtime flow

`cache.get(args)` behaves like:

1. Compute full key from `name`, `version`, and `key(args)`.

2. Check local in-memory map.
   - If hit: return the shared materialized view.

3. If local miss, check in-flight promise map.
   - If present: await the same promise (dedupes concurrent callers).

4. If no in-flight promise:

   a. Check backend (if configured).
   - If backend hit: deserialize stored JSON → rehydrate domain types → run `project` → memoize locally.

   b. If backend miss: call `load(args)` → serialize entity nodes via `toJSON` + scalar nodes via serdes → write to backend (if configured) → rehydrate/materialize locally → run `project` → memoize locally.

5. Return the memoized projected view.

### Concurrent access

- Same-process concurrent misses for the same key are deduped via promise sharing.
- Cross-process duplicate loads are acceptable; because keys are immutable-by-contract, duplicate writes for the same key are harmless.

---

## Serialization model

### Why `toJSON` alone is not sufficient for storage

`toJSON` gives the right shape, but its output is JavaScript values, not a reversible cache format. After a `JSON.stringify` → Redis → `JSON.parse` round-trip:

- `Temporal.ZonedDateTime` becomes a string with no restore path
- `Date` becomes a string
- `bigint` loses its type
- custom serde-backed types need explicit restoration

So v1 needs a **cache serializer/deserializer** that reuses Joist metadata and serdes.

### Serialization rules

**Entity nodes** — use `toJSON` to produce the payload, then apply serde-aware serialization for storage. On rehydration, walk the stored payload with entity metadata to restore domain types (tagged ids stay as strings, `Temporal` fields are restored via their serde, etc.).

**Scalar nodes** — use serde-aware serialization for non-JSON-native types. Plain JSON-native scalars (string, number, boolean) pass through as-is.

**Custom lambda keys** — stored as emitted. Lambda return values should be cache-safe (primitives, ids, arrays, plain objects). If callers want `Map`/`Set`/etc., those belong in `project`.

### Relation serialization

Follows existing `toJSON` semantics:

```ts
{ publisher: true }              // → "p:1"         (id only)
{ publisher: { id: true } }     // → { id: "p:1" }
{ books: true }                  // → ["b:1", "b:2"] (id array)
{ books: { title: true } }      // → [{ title: "..." }, ...]
```

---

## Projection model

`project` exists to bridge the gap between "simple stored data" and "ergonomic in-memory access."

### Rules

- `project` runs only after a cache entry is materialized locally.
- It is **sync-only**.
- It runs **once** per local cache entry.
- The projected result is what local callers receive from `.get(...)`.
- The projected result is memoized by key and shared.

### Good uses for `project`

- `Map` / `Set`
- `byId` indexes
- grouped indexes
- sorted lists
- precomputed totals
- reverse lookup tables

### Example

```ts
project(data) {
  return {
    authors: data.authors,
    authorsById: indexBy(data.authors, (a) => a.id),
    authorsSorted: [...data.authors].sort((a, b) =>
      a.lastName.localeCompare(b.lastName),
    ),
  };
}
```

### If `project` is omitted

`.get(...)` returns the materialized data directly (i.e. `Materialized<S>`).

---

## Memory model

v1 keeps a local in-memory map of materialized entries.

Each local entry stores:

- full key string
- in-flight promise (if loading)
- materialized projected value
- last accessed time

Optional local eviction:

- `maxEntries` config
- LRU-ish cleanup on access

This preserves the "shared object identity" guarantee: repeated reads in one process return the same object. After eviction, the next read materializes a new object from backend storage; that is acceptable.

---

## Readonly / immutability expectations

Cached results should be treated as immutable.

**Type-level**: `Materialized<S>` is `readonly` at each level.

**Runtime**: implementation may optionally `Object.freeze` in development. Production deep-freeze is optional due to performance cost.

Mutation of returned cache values is always a bug.

---

## Why this should not live on `EntityManager`

This API is a top-level `createCache`, not:

- `em.createCache(...)`
- `em.cache.get(...)`
- `entity.toCached(...)`

Reasoning:

1. Caches are application-level composition, not ORM internals.
2. Caches can wrap arbitrary query/list loads, not just one entity.
3. Caches should remain above ORM concerns.
4. Entities and the EM should not gain cache lifecycle responsibility.

Joist provides the hint typing, metadata, loading, and serde machinery — the cache is a separate layer that uses those building blocks.

---

## Backend integration

### Design principle

`createCache` is **not coupled to any specific cache backend**. Instead, it accepts a generic `CacheBackend` interface that can be implemented against Redis, Memcached, DynamoDB, or any key-value store. The interface is deliberately minimal — just `get` and `set` of string values — so that implementations are trivial to write.

### `CacheBackend` interface

```ts
interface CacheBackend {
  /** Retrieve a previously-stored value by key. Returns undefined on miss. */
  get(key: string): Promise<string | undefined>;

  /** Store a value by key. TTL is optional and backend-specific. */
  set(key: string, value: string, opts?: { ttlSeconds?: number }): Promise<void>;
}
```

This is intentionally string-in/string-out. Joist handles all serialization/deserialization internally — the backend only stores and retrieves opaque JSON strings.

### Providing a backend

Backends can be configured per-cache or shared across caches:

```ts
// Per-cache
const authorsCache = createCache({
  name: "authors",
  version: "1",
  backend: redisCacheBackend,
  // ...
});
```

For shared configuration across all caches in an application, a factory pattern works well:

```ts
function createAppCache<K, S, R>(
  opts: Omit<CacheOpts<K, S, R>, "backend">,
) {
  return createCache({ ...opts, backend: redisCacheBackend });
}
```

### If no backend is provided

The cache is **in-memory only**. This is useful for:

- development / testing
- single-process applications
- caches where the load cost is cheap enough that cross-process sharing is unnecessary

### Redis backend example

A Redis backend implementation using `ioredis`:

```ts
import Redis from "ioredis";
import { type CacheBackend } from "joist-orm/cache";

function createRedisCacheBackend(redis: Redis): CacheBackend {
  return {
    async get(key) {
      const value = await redis.get(key);
      return value ?? undefined;
    },
    async set(key, value, opts) {
      if (opts?.ttlSeconds) {
        await redis.set(key, value, "EX", opts.ttlSeconds);
      } else {
        await redis.set(key, value);
      }
    },
  };
}
```

Usage:

```ts
const redis = new Redis(process.env.REDIS_URL);
const redisCacheBackend = createRedisCacheBackend(redis);

const authorsCache = createCache({
  name: "authors",
  version: "1",
  backend: redisCacheBackend,
  memory: { maxEntries: 100 },
  // ...
});
```

### ElastiCache / Memcached backend example

```ts
import Memcached from "memcached";
import { type CacheBackend } from "joist-orm/cache";

function createMemcachedBackend(client: Memcached): CacheBackend {
  return {
    async get(key) {
      return new Promise((resolve, reject) => {
        client.get(key, (err, data) => {
          if (err) reject(err);
          else resolve(data ?? undefined);
        });
      });
    },
    async set(key, value, opts) {
      const ttl = opts?.ttlSeconds ?? 0;
      return new Promise((resolve, reject) => {
        client.set(key, value, ttl, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}
```

### How the backend fits into the runtime flow

The backend is only involved in two places during `cache.get(args)`:

1. **On local miss** — the cache calls `backend.get(fullKey)`.
   - If the backend returns a string, the cache deserializes it, rehydrates domain types, runs `project`, and memoizes the result locally. `load` is never called.
   - If the backend returns `undefined`, the cache calls `load(args)`, serializes the result, calls `backend.set(fullKey, serialized)`, and then materializes locally.

2. **After a fresh `load`** — the cache calls `backend.set(fullKey, serialized)` to share the result with other processes.

The backend is **never** called on a local in-memory hit. Once an entry is memoized locally, all subsequent reads for that key are purely in-memory until local eviction.

### TTL considerations

The `ttlSeconds` option on `set` is **pass-through only**. Joist does not manage or enforce TTLs itself — it delegates entirely to the backend.

A reasonable default configuration:

```ts
const authorsCache = createCache({
  name: "authors",
  version: "1",
  backend: redisCacheBackend,
  ttlSeconds: 86400, // 24 hours — passed to backend.set
  memory: { maxEntries: 100 },
  // ...
});
```

Because v1 uses key-based freshness, TTL exists primarily as a **storage hygiene** mechanism — preventing abandoned keys from accumulating indefinitely in the backend — not as an invalidation strategy.

### Why the interface is string-based

Alternatives considered:

- **`Buffer` / binary**: would allow more compact formats, but adds complexity and prevents easy debugging. JSON strings are human-readable and sufficient for v1.
- **Structured objects**: would couple the backend to Joist's internal serialization format. Keeping it string-based means the backend is a pure transport layer.
- **`mset` / batch operations**: the current `DataCache` uses `mset` for pushing multiple entries. In v1, each `cache.get(...)` call is self-contained (one key, one value), so batch APIs are not needed. Could be added later if warm/preload APIs are introduced.

### Testing without a backend

For tests, caches work with no backend:

```ts
const cache = createCache({
  name: "test",
  version: "1",
  // no backend — in-memory only
  // ...
});
```

For integration tests that want to verify backend behavior, a simple in-memory backend can be used:

```ts
function createInMemoryBackend(): CacheBackend {
  const store = new Map<string, string>();
  return {
    async get(key) {
      return store.get(key);
    },
    async set(key, value) {
      store.set(key, value);
    },
  };
}
```

---

## Limitations in v1

1. **Freshness is caller-owned.** Wrong key = stale result.
2. **No automatic invalidation.** Writes do not clear or update caches.
3. **Custom lambda values are not serde-aware.** They are stored as emitted; callers should return JSON-safe values from lambdas.
4. **Stored payload must be JSON-safe.** Use `project` for `Map`, `Set`, indexes, and other rich local structures.
5. **No manual `.delete` or `.clear`.** Change the key to get fresh data.
6. **No inferred dependency graph.** Especially because custom lambdas and wrapper-level load logic can depend on fields not visible from the cache shape alone.

---

## Alternatives considered

### 1. Reuse `DataCache` directly

Pros: already exists, already has memory + Redis semantics.

Cons: still requires handwritten serialization, handwritten POJO bindings, `pushedAt`/staleness logic we explicitly do not want.

Decision: not enough abstraction.

### 2. Use `ReactiveHint` as the v1 cache definition

Pros: aligns with Joist reactivity, could someday support invalidation.

Cons: `ReactiveHint` does not define output shape as well as `JsonHint`. Custom lambdas and wrapper objects make dependency inference incomplete.

Decision: prefer `JsonHint`-style output definition for v1.

### 3. Store projected values in Redis

Pros: fewer local computations.

Cons: mixes transport/storage concerns with local ergonomic concerns. Encourages storing `Map`/`Set`-like structures. Makes schema evolution harder.

Decision: store simple payloads; project locally.

### 4. Top-level `hint` instead of `data`

An earlier design had the hint as a plain object literal:

```ts
hint: { authors: { id: true, firstName: true } }
```

This fails because there is no way — at compile time or runtime — to know that `authors` is `Author[]` rather than a plain wrapper object. The `entity(Cstr, hint)` / `entities(Cstr, hint)` approach solves both problems: the constructor provides compile-time type rooting and runtime metadata.

Decision: use typed descriptor functions that pair constructors with hints.

---

## Future ideas

### 1. Reactive invalidation

A future version could add optional invalidation support, likely:

- optional `reactiveHint` or `deps` alongside the cache definition
- invalidation hooked off `afterCommit` / plugin infrastructure
- invalidate by namespace + key patterns or tracked entity membership

Deferred because: v1 uses key freshness only, custom lambda keys are not dependency-declarative, and arbitrary query/list caches need more than simple entity-level invalidation.

### 2. Explicit dependency hints for custom lambdas

If invalidation is added later, custom keys may need explicit dependency declarations:

```ts
{
  fullName: cache.derived(["firstName", "lastName"], (a) => ...)
}
```

### 3. Manual maintenance APIs

Could be added later if needed:

- `delete(key)`
- `clear()`
- namespace invalidation
- warm/preload

Not needed for the v1 model where changing the key is the invalidation mechanism.

### 4. More advanced backend features

- stale-while-revalidate
- write-through
- negative caching
- compressed payloads
- backend CAS / set-if-absent semantics

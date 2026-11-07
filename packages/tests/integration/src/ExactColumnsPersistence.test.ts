import { randomUUID } from "node:crypto";

import { createClient } from "@redis/client";
import {
  type EntityManager,
  type ExactColumnsCacheEvent,
  ExactColumnsPlugin,
  type ExactColumnsStoreAdapter,
  type ExactColumnsStoreOpts,
  type ExactColumnsTrackOutcome,
  RedisExactColumnsStore,
} from "joist-orm";
import { Deferred } from "joist-utils";
import { Author } from "src/entities";
import { insertAuthor } from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("ExactColumnsPersistence", () => {
  const client = createClient({
    url: process.env.VALKEY_URL ?? "redis://localhost:6385",
    socket: { reconnectStrategy: false },
  });
  const plugins: ExactColumnsPlugin[] = [];
  const keys = new Set<string>();
  let namespace: string;
  let store: RedisExactColumnsStore;

  beforeAll(async () => {
    await client.connect();
  });
  beforeEach(() => {
    namespace = randomUUID();
    store = new RedisExactColumnsStore({
      sendCommand: async (args) => {
        keys.add(args[1]);
        return client.sendCommand(args);
      },
    });
  });
  afterEach(async () => {
    await Promise.all(plugins.splice(0).map((plugin) => plugin.close()));
    if (keys.size > 0) await client.del([...keys]);
    keys.clear();
  });
  afterAll(async () => {
    await client.close();
  });

  it("restores a same-build profile without full-row warmup", async () => {
    // Given a settled author endpoint persisted by another worker of build A.
    await insertAuthor({ first_name: "a1" });
    await learn(worker("A").plugin);
    // And a fresh worker with no L1 observations.
    const next = worker("A");

    // When its first author request completes.
    await invoke(next.plugin, readFirstName);

    // Then even a same-build hint narrows provisionally without a full-row warmup.
    expect(next.outcomes).toMatchObject([
      {
        lookupSource: "l2_seed",
        profileOrigin: "l2_seed",
        startingMode: "provisional",
        optimized: true,
        retried: false,
      },
    ]);
  });

  it("inherits a seed immediately and promotes it after three clean requests", async () => {
    // Given build A has learned the author endpoint.
    await insertAuthor({ first_name: "a1" });
    await learn(worker("A").plugin);
    // And build B has not observed this endpoint.
    const next = worker("B");

    // When three unchanged requests run on build B.
    for (let i = 0; i < 3; i++) await invoke(next.plugin, readFirstName);
    await next.plugin.flushStore();

    // Then every request benefits from the inherited narrowed projection.
    expect(next.outcomes).toMatchObject([
      { lookupSource: "l2_seed", profileOrigin: "l2_seed", startingMode: "provisional", optimized: true },
      { lookupSource: "l1", profileOrigin: "l2_seed", startingMode: "provisional", optimized: true },
      { lookupSource: "l1", profileOrigin: "l2_seed", startingMode: "provisional", optimized: true },
    ]);
    // And build B has published the next deployment's hint, with no shared learning state.
    expect(await store.load({ namespace, codeVersion: "B", endpointKey: "author" })).toMatchObject({
      codeVersion: "B",
      entities: { Author: { fields: { firstName: true } } },
    });
  });

  it("keeps discoveries local until they settle", async () => {
    // Given the previous build only read firstName.
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await learn(worker("A").plugin);
    // And the new build now reads lastName.
    const changed = worker("B");

    // When the new field invalidates the inherited projection.
    const result = await invoke(changed.plugin, readLastName);
    await changed.plugin.flushStore();

    // Then the request succeeds through the full-row retry.
    expect(result).toBe("l1");
    expect(changed.outcomes).toMatchObject([{ startingMode: "provisional", optimized: true, retried: true }]);

    // When another build B worker starts before learning has settled.
    const next = worker("B");
    await invoke(next.plugin, readLastName);

    // Then the second worker independently discovers the missing field from the unchanged hint.
    expect(next.outcomes).toMatchObject([
      { lookupSource: "l2_seed", startingMode: "provisional", optimized: true, retried: true },
    ]);
  });

  it("lets each worker settle independently of another worker's discovery", async () => {
    // Given two build B workers inherited A's firstName-only seed.
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await learn(worker("A").plugin);
    const stale = worker("B");
    await invoke(stale.plugin, readFirstName);
    await invoke(stale.plugin, readFirstName);
    // And the other worker discovers lastName before the stale worker promotes.
    const changed = worker("B");
    await invoke(changed.plugin, readLastName);
    await changed.plugin.flushStore();

    // When the stale worker tries to publish its third clean observation.
    await invoke(stale.plugin, readFirstName);
    await stale.plugin.flushStore();

    // Then its local settlement publishes its own fields, without a distributed invalidation.
    expect(await store.load({ namespace, codeVersion: "B", endpointKey: "author" })).toMatchObject({
      entities: { Author: { fields: { firstName: true } } },
      codeVersion: "B",
    });
  });

  it("replaces hints with the last settled publication instead of unioning workers", async () => {
    // Given two fresh workers for the same build and an author with two readable fields.
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    const first = worker("A");
    const last = worker("A");

    // When those workers discover different author branches before either publishes.
    await Promise.all([invoke(first.plugin, readFirstName), invoke(last.plugin, readLastName)]);
    await learn(first.plugin, readFirstName);
    await learn(last.plugin, readLastName);

    // Then the last worker's hint replaces the earlier hint, rather than accumulating fleet-wide fields.
    expect((await store.load({ namespace, codeVersion: "A", endpointKey: "author" }))?.entities.Author.fields).toEqual({
      lastName: true,
    });
  });

  it("keeps learning locally when the cache read never completes", async () => {
    // Given the cache connection cannot return a profile.
    await insertAuthor({ first_name: "a1" });
    const unavailable: ExactColumnsStoreAdapter = {
      load: () => new Promise(() => {}),
      save: (update) => store.save(update),
    };
    const next = worker("A", { store: unavailable, timeoutMs: 5 });

    // When the endpoint learns and then serves another request.
    await learn(next.plugin);
    await invoke(next.plugin, readFirstName);

    // Then a cache timeout does not prevent local optimization.
    expect(next.outcomes.at(-1)).toMatchObject({
      lookupSource: "l1",
      profileOrigin: "local",
      startingMode: "narrow",
      optimized: true,
    });
    expect(next.events[0]).toMatchObject({ operation: "load", result: "timeout" });
  });

  it("ignores a late seed lookup after local learning has begun", async () => {
    // Given an old seed whose delivery is delayed beyond the cache deadline.
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await learn(worker("A").plugin);
    const delayed = new Deferred<Awaited<ReturnType<ExactColumnsStoreAdapter["load"]>>>();
    const next = worker("B", {
      store: { load: () => delayed.promise, save: (update) => store.save(update) },
      timeoutMs: 5,
    });

    // When build B learns lastName locally before the old firstName seed arrives.
    await invoke(next.plugin, readLastName);
    delayed.resolve(await store.load({ namespace, codeVersion: "B", endpointKey: "author" }));
    await learn(next.plugin, readLastName);
    await invoke(next.plugin, readLastName);

    // Then the late seed never replaces the locally learned lastName projection.
    expect(next.outcomes.at(-1)).toMatchObject({
      profileOrigin: "local",
      startingMode: "narrow",
      optimized: true,
      retried: false,
    });
  });

  it("does not retry a missing field after a committed write", async () => {
    // Given a seed for renaming authors that has never read age.
    await insertAuthor({ first_name: "a1", last_name: "l1", age: 40 });
    await learn(worker("A").plugin, async (em) => {
      const author = await em.load(Author, "a:1");
      author.firstName = "seeded";
      await em.flush();
    });
    // And a new build that reads age after committing a firstName change.
    const next = worker("B");

    // When the inherited projection misses that post-write field.
    await expect(
      invoke(next.plugin, async (em) => {
        const author = await em.load(Author, "a:1");
        author.firstName = "changed";
        await em.flush();
        return author.age;
      }),
    ).rejects.toThrow("age");

    // Then telemetry reports a non-replayable failure rather than a retry.
    expect(next.outcomes).toMatchObject([{ startingMode: "provisional", retried: false, missingColumnFailure: true }]);
  });

  it("isolates profiles by application namespace", async () => {
    // Given another application's learned author profile in the same Valkey database.
    await insertAuthor({ first_name: "a1" });
    await learn(worker("A").plugin);
    // And a worker using another namespace.
    const next = worker("A", { namespace: randomUUID() });

    // When that application's first author request runs.
    await invoke(next.plugin, readFirstName);

    // Then it starts cold rather than trusting another application's seed.
    expect(next.outcomes).toMatchObject([
      { lookupSource: "cold", profileOrigin: "local", startingMode: "learning", optimized: false },
    ]);
  });

  it("uses the narrowed SQL projection on the first cross-deployment request", async () => {
    // Given a real PostgreSQL-backed profile learned by build A.
    await insertAuthor({ first_name: "a1" });
    await learn(worker("A").plugin);
    // And a new build with only the shared seed available.
    const next = worker("B");
    resetQueryCount();

    // When build B serves its very first request.
    await invoke(next.plugin, readFirstName);

    // Then PostgreSQL receives an explicit projection without a full-row warmup.
    expect(queries).toMatchInlineSnapshot(`
      [
        "SELECT a.id, a.first_name, a.deleted_at, a.created_at, a.updated_at FROM authors AS a WHERE a.id = ANY($1) ORDER BY a.id ASC LIMIT $2",
      ]
    `);
  });

  it("never imports another worker's later discoveries into a warm L1 profile", async () => {
    // Given a settled build A profile and a worker actively serving narrowed requests.
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await learn(worker("A").plugin);
    const warm = worker("A", { publishIntervalMs: 1 });
    await learn(warm.plugin);
    // And another worker discovers and settles a missing lastName field.
    const changed = worker("A");
    await invoke(changed.plugin, readLastName);
    await learn(changed.plugin, readLastName);
    await changed.plugin.flushStore();

    // When the warm worker continues serving requests and then reads lastName itself.
    await invoke(warm.plugin, readFirstName);
    await warm.plugin.flushStore();
    await invoke(warm.plugin, readLastName);

    // Then it discovers the missing field independently; no remote save updated its L1.
    expect(warm.outcomes.at(-1)).toMatchObject({
      lookupSource: "l1",
      startingMode: "narrow",
      optimized: true,
      retried: true,
    });
  });

  it("rejects an inherited profile containing a field removed from the model", async () => {
    // Given an actual learned author profile from the old deployment.
    await insertAuthor({ first_name: "a1" });
    await learn(worker("A").plugin);
    const cached = await store.load({ namespace, codeVersion: "A", endpointKey: "author" });
    // And its serialized seed refers to a field no longer present in this model.
    cached!.entities.Author.fields.retiredField = true;
    const seedKey = [...keys][0];
    await client.set(seedKey, JSON.stringify(cached));
    const next = worker("B");

    // When the new build serves an author request.
    await invoke(next.plugin, readFirstName);

    // Then incompatible observations cannot authorize a narrowed projection.
    expect(next.outcomes).toMatchObject([
      { lookupSource: "cold", profileOrigin: "local", startingMode: "learning", optimized: false },
    ]);
  });

  it("deduplicates concurrent cold lookups within a worker", async () => {
    // Given a previously learned profile and a fresh worker.
    await insertAuthor({ first_name: "a1" });
    await learn(worker("A").plugin);
    const next = worker("A");

    // When several author requests arrive before the worker has initialized its L1 profile.
    await Promise.all([
      invoke(next.plugin, readFirstName),
      invoke(next.plugin, readFirstName),
      invoke(next.plugin, readFirstName),
    ]);

    // Then the cache reports one successful cold lookup for the shared initialization.
    expect(next.events.filter((event) => event.operation === "load" && event.result === "success")).toHaveLength(1);
  });

  it("reports local provenance when persistence is omitted", async () => {
    // Given an author endpoint with an L1-only plugin.
    await insertAuthor({ first_name: "a1" });
    const outcomes: ExactColumnsTrackOutcome[] = [];
    const plugin = new ExactColumnsPlugin({ onTrack: (outcome) => outcomes.push(outcome) });

    // When two requests run without any cache store.
    await invoke(plugin, readFirstName);
    await invoke(plugin, readFirstName);

    // Then both requests use the same telemetry shape with local origins.
    expect(outcomes).toMatchObject([
      { lookupSource: "cold", profileOrigin: "local", startingMode: "learning" },
      { lookupSource: "l1", profileOrigin: "local", startingMode: "learning" },
    ]);
  });

  it("renews an active hint through successful requests", async () => {
    // Given a settled author seed that is close to expiring.
    await insertAuthor({ first_name: "a1" });
    const active = worker("A");
    await learn(active.plugin);
    const seedKey = [...keys][0];
    await client.expire(seedKey, 5);

    // When another successful request republishes the local settled hint.
    const clock = jest.spyOn(Date, "now").mockReturnValue(Date.now() + 60_001);
    try {
      await invoke(active.plugin, readFirstName);
      await active.plugin.flushStore();
    } finally {
      clock.mockRestore();
    }

    // Then the next deployment can still inherit the seed after the original expiry window.
    expect(await client.ttl(seedKey)).toBeGreaterThan(5);
  });

  it("isolates corrupt cache JSON from other endpoint lookups", async () => {
    // Given two settled endpoints sharing the same Valkey store.
    await insertAuthor({ first_name: "a1" });
    const seed = worker("A");
    await learn(seed.plugin);
    const authorKey = [...keys][0];
    for (let i = 0; i < 4; i++) {
      await invoke(seed.plugin, readFirstName, "other");
      await seed.plugin.flushStore();
    }
    // And the author profile contains invalid JSON.
    await client.set(authorKey, "broken JSON");
    const next = worker("A");

    // When a cold worker encounters that profile and then serves the other endpoint.
    await invoke(next.plugin, readFirstName);
    await next.plugin.flushStore();
    await invoke(next.plugin, readFirstName, "other");

    // Then bad endpoint data has not started connection backoff for the whole store.
    expect(next.outcomes.at(-1)).toMatchObject({
      endpointKey: "other",
      lookupSource: "l2_seed",
      startingMode: "provisional",
    });
  });

  it("contains malformed custom-adapter replies inside the store error boundary", async () => {
    // Given real author reads and an adapter that returns an invalid hint.
    await insertAuthor({ first_name: "a1" });
    const next = worker("A", {
      store: {
        load: async () => ({}) as Awaited<ReturnType<ExactColumnsStoreAdapter["load"]>>,
        save: (update) => store.save(update),
      },
    });

    // When the first request attempts to adopt the malformed hint.
    await invoke(next.plugin, readFirstName);
    await next.plugin.flushStore();

    // Then the bad reply is reported rather than escaping as an unhandled rejection.
    expect(next.events.filter((event) => event.operation === "reject")).toMatchObject([
      { endpointKey: "author", result: "error" },
    ]);
  });

  it("discards failed publications and keeps serving the local narrowed profile", async () => {
    // Given a working cache read but a failing publication connection.
    await insertAuthor({ first_name: "a1" });
    const next = worker("A", {
      store: {
        load: (key) => store.load(key),
        save: async () => {
          throw new Error("connection interrupted");
        },
      },
    });

    // When local learning settles despite the failed save, and drains are requested again.
    await learn(next.plugin);
    await next.plugin.flushStore();
    await invoke(next.plugin, readFirstName);

    // Then local optimization is unaffected and the failure is reported once without queued retries.
    expect(next.outcomes.at(-1)).toMatchObject({ startingMode: "narrow", optimized: true });
    expect(next.events.filter((event) => event.operation === "save")).toMatchObject([{ result: "error" }]);
  });

  it("publishes nothing while a cold endpoint is still learning", async () => {
    // Given an author endpoint with no saved hint.
    await insertAuthor({ first_name: "a1" });
    const next = worker("A");

    // When its first field discovery has not yet earned local settlement.
    await invoke(next.plugin, readFirstName);
    await next.plugin.flushStore();

    // Then L2 has no learning state to share with other workers.
    expect(await store.load({ namespace, codeVersion: "A", endpointKey: "author" })).toBeUndefined();
  });

  it("contains timed-out saves without delaying shutdown or local learning", async () => {
    // Given a cache adapter whose publication never finishes.
    await insertAuthor({ first_name: "a1" });
    const next = worker("A", {
      timeoutMs: 5,
      store: { load: (key) => store.load(key), save: () => new Promise(() => {}) },
    });

    // When local settlement publishes a hint and the application closes the plugin.
    await learn(next.plugin);
    await next.plugin.close();

    // Then shutdown completes after the cache deadline rather than waiting for the adapter forever.
    expect(next.events.filter((event) => event.operation === "save")).toMatchObject([{ result: "timeout" }]);
  });

  it("publishes the current hint on a later successful request after an outage", async () => {
    // Given local settlement whose first publication failed.
    await insertAuthor({ first_name: "a1" });
    let unavailable = true;
    const next = worker("A", {
      store: {
        load: (key) => store.load(key),
        save: async (update) => {
          if (unavailable) throw new Error("connection interrupted");
          await store.save(update);
        },
      },
    });
    await learn(next.plugin);
    // And the cache recovers after the publication interval and outage backoff.
    unavailable = false;
    const clock = jest.spyOn(Date, "now").mockReturnValue(Date.now() + 60_001);

    // When another successful request offers the current local snapshot.
    try {
      await invoke(next.plugin, readFirstName);
      await next.plugin.flushStore();
    } finally {
      clock.mockRestore();
    }

    // Then a hint is saved without replaying a queued state transition.
    expect((await store.load({ namespace, codeVersion: "A", endpointKey: "author" }))?.entities.Author.fields).toEqual({
      firstName: true,
    });
  });

  it("skips a queued hint if its local endpoint has deoptimized", async () => {
    // Given an unrelated endpoint whose save is holding the background writer.
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    const blocked = new Deferred<void>();
    const release = new Deferred<void>();
    const next = worker("A", {
      store: {
        load: (key) => store.load(key),
        save: async (update) => {
          if (update.endpointKey === "blocker") {
            blocked.resolve();
            await release.promise;
          }
          await store.save(update);
        },
      },
    });
    for (let i = 0; i < 4; i++) await invoke(next.plugin, readFirstName, "blocker");
    await blocked.promise;
    // And the author endpoint settles while its publication is queued behind that save.
    for (let i = 0; i < 4; i++) await invoke(next.plugin, readFirstName);

    // When the author endpoint discovers lastName before the writer reaches it.
    try {
      await invoke(next.plugin, readLastName);
    } finally {
      release.resolve();
    }
    await next.plugin.flushStore();

    // Then a profile that is now learning is not published as a settled hint.
    expect(await store.load({ namespace, codeVersion: "A", endpointKey: "author" })).toBeUndefined();
  });

  /** Creates a worker with a shared deployment identity and isolated L1. */
  function worker(codeVersion: string, overrides: Partial<ExactColumnsStoreOpts> = {}) {
    const outcomes: ExactColumnsTrackOutcome[] = [];
    const events: ExactColumnsCacheEvent[] = [];
    const plugin = new ExactColumnsPlugin({
      store: {
        store,
        namespace,
        codeVersion,
        timeoutMs: 1000,
        onCacheEvent: (event) => events.push(event),
        ...overrides,
      },
      onTrack: (outcome) => outcomes.push(outcome),
    });
    plugins.push(plugin);
    return { plugin, outcomes, events };
  }
});

/** Runs a request with a fresh EM on each attempt, including a missing-column retry. */
function invoke<T>(plugin: ExactColumnsPlugin, fn: (em: EntityManager) => Promise<T>, key = "author"): Promise<T> {
  return plugin.track(key, () => {
    const em = newEntityManager();
    em.addPlugin(plugin);
    return fn(em);
  });
}

/** Settle a fresh profile and finish its best-effort hint publication. */
async function learn(
  plugin: ExactColumnsPlugin,
  fn: (em: EntityManager) => Promise<unknown> = readFirstName,
): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await invoke(plugin, fn);
  }
  await plugin.flushStore();
}

/** The unchanged author endpoint used across deployments. */
async function readFirstName(em: EntityManager): Promise<string> {
  return (await em.load(Author, "a:1")).firstName;
}

/** A deployment that starts using an additional author field. */
async function readLastName(em: EntityManager): Promise<string | undefined> {
  return (await em.load(Author, "a:1")).lastName;
}

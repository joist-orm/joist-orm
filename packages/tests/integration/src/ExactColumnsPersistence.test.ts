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
        for (const key of args[0] === "MGET" ? args.slice(1) : args.slice(3, 5)) keys.add(key);
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

    // Then it narrows immediately from the exact-version cache.
    expect(next.outcomes).toMatchObject([
      {
        lookupSource: "l2_version",
        profileOrigin: "l2_version",
        startingMode: "narrow",
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
    // And build B has earned both its own settled profile and the next deployment's seed.
    expect(await store.load({ namespace, codeVersion: "B", endpointKey: "author" })).toMatchObject({
      version: { state: "settled", codeVersion: "B" },
      seed: { state: "settled", codeVersion: "B" },
    });
  });

  it("retries changed code and restores its learning state instead of the older seed", async () => {
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

    // Then the exact-version learning entry prevents reusing the stale seed.
    expect(next.outcomes).toMatchObject([
      { lookupSource: "l2_version", startingMode: "learning", optimized: false, retried: false },
    ]);
  });

  it("does not let a stale worker promote over another worker's discovery", async () => {
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

    // Then the stored profile retains the wider learning state and the old seed is not replaced.
    expect(await store.load({ namespace, codeVersion: "B", endpointKey: "author" })).toMatchObject({
      version: { state: "learning", entities: { Author: { fields: { firstName: true, lastName: true } } } },
      seed: { codeVersion: "A" },
    });
  });

  it("unions discoveries from workers learning different branches", async () => {
    // Given two fresh workers for the same build and an author with two readable fields.
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    const first = worker("A");
    const last = worker("A");

    // When those workers concurrently discover different author branches.
    await Promise.all([invoke(first.plugin, readFirstName), invoke(last.plugin, readLastName)]);
    await Promise.all([first.plugin.flushStore(), last.plugin.flushStore()]);

    // Then neither worker overwrites the other's observed field.
    expect(
      (await store.load({ namespace, codeVersion: "A", endpointKey: "author" })).version?.entities.Author.fields,
    ).toEqual({ firstName: true, lastName: true });
  });

  it("keeps learning locally when the cache read never completes", async () => {
    // Given the cache connection cannot return a profile.
    await insertAuthor({ first_name: "a1" });
    const unavailable: ExactColumnsStoreAdapter = {
      load: () => new Promise(() => {}),
      merge: (update) => store.merge(update),
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
      store: { load: () => delayed.promise, merge: (update) => store.merge(update) },
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

  it("refreshes a warm worker after another worker deoptimizes", async () => {
    // Given a settled build A profile and a worker actively serving narrowed requests.
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await learn(worker("A").plugin);
    const refreshed = new Deferred<void>();
    let discoveryPersisted = false;
    const warm = worker("A", {
      refreshIntervalMs: 20,
      onCacheEvent: (event) => {
        if (discoveryPersisted && event.operation === "refresh" && event.result === "success") refreshed.resolve();
      },
    });
    await invoke(warm.plugin, readFirstName);
    // And another worker discovers a missing lastName field.
    const changed = worker("A");
    await invoke(changed.plugin, readLastName);
    await changed.plugin.flushStore();
    discoveryPersisted = true;
    // Keep the endpoint active even if an earlier timer fired while the discovery was being persisted.
    await invoke(warm.plugin, readFirstName);

    // When the warm worker refreshes before reading lastName itself.
    await refreshed.promise;
    await warm.plugin.flushStore();
    await invoke(warm.plugin, readLastName);

    // Then it already knows to use full rows instead of repeating the other worker's miss.
    expect(warm.outcomes.at(-1)).toMatchObject({
      lookupSource: "l1",
      startingMode: "learning",
      optimized: false,
      retried: false,
    });
  });

  it("rejects an inherited profile containing a field removed from the model", async () => {
    // Given an actual learned author profile from the old deployment.
    await insertAuthor({ first_name: "a1" });
    await learn(worker("A").plugin);
    const cached = await store.load({ namespace, codeVersion: "A", endpointKey: "author" });
    // And its serialized seed refers to a field no longer present in this model.
    cached.seed!.entities.Author.fields.retiredField = true;
    const seedKey = [...keys].find((key) => key.endsWith(":seed"))!;
    await client.set(seedKey, JSON.stringify(cached.seed));
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

  it("does not resurrect stale readiness after the version entry is evicted", async () => {
    // Given a worker's actual settled author profile and its observed revision.
    await insertAuthor({ first_name: "a1" });
    await learn(worker("A").plugin);
    const key = { namespace, codeVersion: "A", endpointKey: "author" };
    const cached = (await store.load(key)).version!;
    // And Valkey has evicted that version entry while the worker retains its L1 profile.
    const versionKey = [...keys].find((value) => value.includes(":version:"))!;
    await client.del(versionKey);

    // When the worker attempts a settled publication against the vanished revision.
    await store.merge({
      ...key,
      snapshot: cached,
      expectedRevision: cached.revision,
      invalidate: false,
      publishSeed: true,
    });

    // Then the replacement version entry requires new observations before narrowing.
    expect((await store.load(key)).version?.state).toBe("learning");
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
function invoke<T>(plugin: ExactColumnsPlugin, fn: (em: EntityManager) => Promise<T>): Promise<T> {
  return plugin.track("author", () => {
    const em = newEntityManager();
    em.addPlugin(plugin);
    return fn(em);
  });
}

/** Settle a fresh profile, draining writes so another worker can observe each transition. */
async function learn(
  plugin: ExactColumnsPlugin,
  fn: (em: EntityManager) => Promise<unknown> = readFirstName,
): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await invoke(plugin, fn);
    await plugin.flushStore();
  }
}

/** The unchanged author endpoint used across deployments. */
async function readFirstName(em: EntityManager): Promise<string> {
  return (await em.load(Author, "a:1")).firstName;
}

/** A deployment that starts using an additional author field. */
async function readLastName(em: EntityManager): Promise<string | undefined> {
  return (await em.load(Author, "a:1")).lastName;
}

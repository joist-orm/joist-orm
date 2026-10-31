import type {
  ExactColumnsCacheEvent,
  ExactColumnsPersistenceOpts,
  ExactColumnsSnapshot,
  ExactColumnsStoredProfile,
} from "./ExactColumnsStoreAdapter.ts";

/** Keeps cache I/O out of field reads and query preparation. */
export interface PersistedEndpoint {
  snapshot(): ExactColumnsSnapshot;
  isProvisional(): boolean;
  /** Returns false when the snapshot is incompatible with the running model. */
  merge(profile: ExactColumnsStoredProfile, reset: boolean): boolean;
}

interface Entry {
  /** Reads and updates this endpoint's live L1 profile. */
  endpoint: PersistedEndpoint;
  /** Last L2 revision observed; a different revision prevents us from publishing stale readiness. */
  revision: string | undefined;
  /** Increments on local changes so a write finishing later knows another snapshot is needed. */
  generation: number;
  /** A missing column still needs to mark the version's L2 profile as learning. */
  invalidate: boolean;
  /** Local learning or provisional reuse settled; the next successful write should publish a seed. */
  publishSeed: boolean;
  /** The endpoint served a request since the last refresh tick and needs another refresh. */
  active: boolean;
  /** The queued operation is a background refresh, rather than a local profile change. */
  refresh: boolean;
}

/**
 * Shares the plugin's learned endpoint profiles through L2 without writing to Redis on each request.
 *
 * Local changes queue a snapshot for persistence; background refreshes bring in fields discovered
 * by other workers. If the cache is slow or unavailable, requests continue using their L1 profiles.
 */
export class ExactColumnsStore {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Set<string>();
  private readonly opts: ExactColumnsPersistenceOpts;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing: Promise<void> | undefined;
  private retryAt = 0;
  private failures = 0;
  private closed = false;
  private readonly outstanding = new Set<Promise<unknown>>();

  constructor(opts: ExactColumnsPersistenceOpts) {
    this.opts = opts;
    if (!opts.namespace || !opts.codeVersion)
      throw new Error("Exact columns persistence requires namespace and codeVersion");
    for (const value of [opts.timeoutMs ?? 50, opts.refreshIntervalMs ?? 60_000, opts.maxPending ?? 1000]) {
      if (!Number.isSafeInteger(value) || value <= 0)
        throw new Error("Exact columns persistence limits must be positive integers");
    }
  }

  /** Cold reads are bounded; their late results are never applied to a locally learning endpoint. */
  async load(key: string) {
    return this.run(key, "load", () => this.opts.store.load(this.key(key)));
  }

  /** Register only after initialization, so background refresh cannot replace a half-loaded profile. */
  register(key: string, endpoint: PersistedEndpoint, revision?: string): void {
    this.entries.set(key, {
      endpoint,
      revision,
      generation: 0,
      invalidate: false,
      publishSeed: false,
      active: true,
      refresh: false,
    });
    this.scheduleRefresh();
  }

  /** Dirty changes coalesce by endpoint; a deoptimization takes precedence over a pending promotion. */
  changed(key: string, invalidate: boolean, publishSeed: boolean): void {
    const entry = this.entries.get(key);
    if (!entry || this.closed) return;
    entry.generation++;
    entry.refresh = false;
    entry.invalidate ||= invalidate;
    entry.publishSeed = invalidate ? false : entry.publishSeed || publishSeed;
    this.enqueue(key, invalidate);
  }

  /** Marks an endpoint for the next background refresh without any request-time I/O. */
  touch(key: string): void {
    const entry = this.entries.get(key);
    if (entry) entry.active = true;
  }

  /** Telemetry errors must not replace endpoint results or break background persistence. */
  emit(event: ExactColumnsCacheEvent): void {
    try {
      this.opts.onCacheEvent?.({
        codeVersion: this.opts.codeVersion,
        revision: this.entries.get(event.endpointKey)?.revision,
        ...event,
      });
    } catch {
      /* Application telemetry is best effort. */
    }
  }

  /** Best-effort drain after requests finish; a cache outage never blocks shutdown indefinitely. */
  async flush(): Promise<void> {
    if (this.writing) await this.writing;
    this.startWrites();
    if (this.writing) await this.writing;
  }

  /** Stop background work after a best-effort drain. The application still owns its Redis connection. */
  async close(): Promise<void> {
    this.closed = true;
    clearTimeout(this.timer);
    await this.flush();
    this.pending.clear();
  }

  /** Prioritize invalidations; never retain an unbounded queue during a cache outage. */
  private enqueue(key: string, priority = false): void {
    if (priority) this.pending.delete(key);
    if (this.pending.size >= (this.opts.maxPending ?? 1000)) {
      if (!priority) return;
      const queued = [...this.pending].reverse();
      this.pending.delete(queued.find((other) => !this.entries.get(other)?.invalidate) ?? queued[0]);
    }
    if (priority) {
      const rest = [...this.pending];
      this.pending.clear();
      this.pending.add(key);
      for (const other of rest) this.pending.add(other);
    } else {
      this.pending.add(key);
    }
    this.startWrites();
  }

  /** A single writer bounds concurrency and preserves each worker's invalidation/publication order. */
  private startWrites(): void {
    if (this.writing || this.pending.size === 0 || Date.now() < this.retryAt) return;
    this.writing = Promise.resolve()
      .then(() => this.writePending())
      .finally(() => {
        this.writing = undefined;
      });
  }

  /**
   * Reconcile remote discoveries before another settled publication is attempted.
   *
   * Local requests can keep growing the union while a write is in flight. Their generation queues
   * another snapshot; only the response's revision becomes the next publication's fence.
   */
  private async writePending(): Promise<void> {
    while (this.pending.size > 0 && Date.now() >= this.retryAt) {
      const key = this.pending.values().next().value!;
      this.pending.delete(key);
      const entry = this.entries.get(key)!;
      // Provisional profiles have not earned a version entry yet, but must still see peer invalidations.
      if (entry.refresh && entry.endpoint.isProvisional()) {
        const loaded = await this.run(key, "refresh", () => this.opts.store.load(this.key(key)));
        if (!loaded) {
          this.enqueue(key);
          break;
        }
        if (loaded.version) {
          entry.revision = loaded.version.revision;
          if (!entry.endpoint.merge(loaded.version, loaded.version.state === "learning")) {
            this.emit({ endpointKey: key, operation: "reject", result: "error" });
            this.entries.delete(key);
            this.pending.delete(key);
          }
        }
        continue;
      }
      const generation = entry.generation;
      const invalidate = entry.invalidate;
      const publishSeed = entry.publishSeed;
      entry.invalidate = false;
      entry.publishSeed = false;
      const snapshot = entry.endpoint.snapshot();
      const result = await this.run(key, entry.refresh ? "refresh" : "merge", () =>
        this.opts.store.merge({
          ...this.key(key),
          snapshot,
          expectedRevision: entry.revision,
          invalidate,
          publishSeed,
        }),
      );
      if (!result) {
        entry.invalidate ||= invalidate;
        entry.publishSeed ||= publishSeed;
        this.enqueue(key, entry.invalidate);
        break;
      }
      entry.revision = result.profile.revision;
      const reset =
        (result.conflict && result.profile.state === "learning") ||
        (snapshot.state === "settled" && result.profile.state === "learning");
      if (!entry.endpoint.merge(result.profile, reset)) {
        this.emit({ endpointKey: key, operation: "reject", result: "error" });
        // Keep the local learner, but do not propagate a same-build model mismatch into new seeds.
        this.entries.delete(key);
        this.pending.delete(key);
        continue;
      }
      if (result.conflict) this.emit({ endpointKey: key, operation: "merge", result: "conflict" });
      if (generation !== entry.generation) this.enqueue(key, entry.invalidate);
    }
  }

  /** Refresh only endpoints used since the last tick, with jitter to spread deployment-wide traffic. */
  private scheduleRefresh(): void {
    if (this.timer || this.closed) return;
    const interval = (this.opts.refreshIntervalMs ?? 60_000) * (0.8 + Math.random() * 0.4);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      // Merge also reads the latest union, and renews only the version key's TTL.
      for (const [key, entry] of this.entries) {
        if (!entry.active) continue;
        entry.active = false;
        entry.refresh = !this.pending.has(key);
        this.enqueue(key);
      }
      this.startWrites();
      this.scheduleRefresh();
    }, interval);
    this.timer.unref();
  }

  /**
   * Bound cache waiting and suppress subsequent attempts during an exponential backoff.
   *
   * Client commands cannot be canceled through the store interface, so also cap unresolved commands
   * independently of the write queue. Late results are consumed but never applied after a timeout.
   */
  private async run<T>(
    key: string,
    operation: "load" | "merge" | "refresh",
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    if (Date.now() < this.retryAt || this.outstanding.size >= 16) {
      if (this.outstanding.size >= 16) this.retryAt = Date.now() + 1000;
      this.emit({ endpointKey: key, operation, result: "backoff" });
      return undefined;
    }
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Error("Exact columns cache timeout");
    try {
      // A timeout cannot cancel an arbitrary client's command. Bound those outstanding promises too.
      const command = Promise.resolve().then(fn);
      this.outstanding.add(command);
      void command.then(
        () => this.outstanding.delete(command),
        () => this.outstanding.delete(command),
      );
      const result = await Promise.race([
        command,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(timeout), this.opts.timeoutMs ?? 50);
        }),
      ]);
      this.failures = 0;
      this.retryAt = 0;
      this.emit({ endpointKey: key, operation, result: "success", durationMs: Date.now() - start });
      return result;
    } catch (error) {
      this.retryAt = Date.now() + Math.min(30_000, 1000 * 2 ** Math.min(this.failures++, 5));
      this.emit({
        endpointKey: key,
        operation,
        result: error === timeout ? "timeout" : "error",
        durationMs: Date.now() - start,
        error,
      });
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Construct the application-scoped identity without exposing Redis key details to the plugin. */
  private key(endpointKey: string) {
    return { endpointKey, namespace: this.opts.namespace, codeVersion: this.opts.codeVersion };
  }
}

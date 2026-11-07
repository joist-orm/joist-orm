import {
  type ExactColumnsCacheEvent,
  ExactColumnsProfileRejectedError,
  type ExactColumnsSnapshot,
  type ExactColumnsStoreOpts,
  validateStoredProfile,
} from "./ExactColumnsStoreAdapter.ts";

/** Supplies initial hints and publishes local snapshots without feeding responses back into learning. */
export class ExactColumnsStore {
  private readonly pending = new Map<string, () => ExactColumnsSnapshot | undefined>();
  private readonly publishAt = new Map<string, number>();
  private readonly outstanding = new Set<Promise<unknown>>();
  private writing: Promise<void> | undefined;
  private retryAt = 0;
  private failures = 0;
  private closed = false;

  constructor(private readonly opts: ExactColumnsStoreOpts) {
    if (!opts.namespace || !opts.codeVersion)
      throw new Error("Exact columns persistence requires namespace and codeVersion");
    for (const value of [opts.timeoutMs ?? 50, opts.publishIntervalMs ?? 60_000, opts.maxPending ?? 1000]) {
      if (!Number.isSafeInteger(value) || value <= 0)
        throw new Error("Exact columns persistence limits must be positive integers");
    }
  }

  /** Only initialization reads L2; timed-out responses never reach the local learner. */
  async load(key: string) {
    return this.run(key, "load", async () => {
      const profile = await this.opts.store.load(this.key(key));
      if (profile !== undefined) validateStoredProfile(profile);
      return profile;
    });
  }

  /**
   * Coalesce publications and periodically renew active hints through successful requests.
   *
   * The getter reads current local state when the writer reaches this endpoint. If it has since
   * deoptimized, it returns undefined and skips publication. Failed saves are discarded; a later
   * settlement or eligible request can try again without a retry timer or durable delivery queue.
   */
  publish(key: string, snapshot: () => ExactColumnsSnapshot | undefined, settled = false): void {
    if (this.closed || Date.now() < this.retryAt) return;
    if (!settled && Date.now() < (this.publishAt.get(key) ?? 0)) return;
    if (!this.pending.has(key) && this.pending.size >= (this.opts.maxPending ?? 1000)) return;
    this.publishAt.set(key, Date.now() + (this.opts.publishIntervalMs ?? 60_000));
    this.pending.set(key, snapshot);
    this.startWrites();
  }

  /** Telemetry errors must not replace endpoint results or break background persistence. */
  emit(event: ExactColumnsCacheEvent): void {
    try {
      this.opts.onCacheEvent?.({ codeVersion: this.opts.codeVersion, ...event });
    } catch {
      /* Application telemetry is best effort. */
    }
  }

  /** Drain queued hints once; cache failures do not schedule another attempt. */
  async flush(): Promise<void> {
    while (this.writing) await this.writing;
  }

  /** Stop accepting publications and finish the bounded, best-effort drain. */
  async close(): Promise<void> {
    this.closed = true;
    await this.flush();
  }

  /** One writer keeps background cache traffic bounded and coalesces busy endpoints. */
  private startWrites(): void {
    if (this.writing || this.pending.size === 0) return;
    this.writing = Promise.resolve()
      .then(() => this.writePending())
      .finally(() => {
        this.writing = undefined;
        // A request can enqueue after the loop finishes but before this callback executes.
        this.startWrites();
      });
  }

  /** Attempt each queued endpoint once, taking its latest settled snapshot inside the error boundary. */
  private async writePending(): Promise<void> {
    for (const [key, snapshot] of this.pending) {
      this.pending.delete(key);
      await this.run(key, "save", async () => {
        const current = snapshot();
        if (current) await this.opts.store.save({ ...this.key(key), snapshot: current });
      });
    }
  }

  /**
   * Bound cache waiting and suppress operations during an outage.
   *
   * Client commands cannot be canceled through the store interface, so also cap unresolved commands.
   * Their late results are consumed but never applied to L1; a late save is just another L2 hint.
   */
  private async run<T>(key: string, operation: "load" | "save", fn: () => Promise<T>): Promise<T | undefined> {
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
      if (error instanceof ExactColumnsProfileRejectedError) {
        this.emit({ endpointKey: key, operation: "reject", result: "error", error });
      } else {
        this.retryAt = Date.now() + Math.min(30_000, 1000 * 2 ** Math.min(this.failures++, 5));
        this.emit({
          endpointKey: key,
          operation,
          result: error === timeout ? "timeout" : "error",
          durationMs: Date.now() - start,
          error,
        });
      }
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

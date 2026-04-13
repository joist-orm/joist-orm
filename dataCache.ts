import { JsonBinding } from "@adllang/jsonbinding";
import tracer from "dd-trace";
import { isEntity } from "joist-orm";
import pluralize from "pluralize";
import { BaseContext } from "src/context";
import { assertDefined, fail, isDefined } from "src/utils";
import { nowUTC, zdt } from "src/utils/temporal";
import { Temporal } from "temporal-polyfill";

// Completely disable the cache.  Primarily used for tests that should be isolated.
let disabled = false;

type CacheEntry<T> = {
  key: string;
  accessedAt: Temporal.ZonedDateTime | undefined;
  pushedAt: Temporal.ZonedDateTime | undefined;
  promise: Promise<void> | undefined;
  data: T | undefined;
};

let caches: DataCache<any, any>[] = [];

export type DataCacheOpts<T, Args extends Array<any> = any[]> = {
  name: string;
  binding: JsonBinding<T>;
  version: string;
  maxEntries?: number;
  elastiCache?: { enabled?: boolean; expiration?: Temporal.DurationLike };
  additionalKeyFn?: (...args: Args) => any;
};

/**
 * A caching system that manages data with both in-memory and ElastiCache storage.
 *
 * The cache supports automatic cleanup of stale entries, synchronization with ElastiCache,
 * and configurable timeout and entry limits. It ensures safe parallel access to cached data
 *
 * @template T - The type of data being cached
 * @template Args - Array type representing the arguments used to generate cache keys and fetch data
 */
export class DataCache<T, Args extends Array<any>> {
  readonly #name: string;
  readonly #binding: JsonBinding<T>;
  readonly #version: string;
  readonly #maxEntries: number;
  readonly #elastiCache: { enabled: boolean; expiration: Temporal.DurationLike };
  readonly #additionalKeyFn?: (...args: Args) => any;

  readonly #dataFn: (...args: Args) => Promise<T>;

  #entries = new Map<string, CacheEntry<T>>();
  #pushPromise: Promise<void> | undefined;

  protected constructor(opts: DataCacheOpts<T, Args>, dataFn: (...args: Args) => Promise<T>) {
    this.#name = opts.name;
    this.#binding = opts.binding;
    this.#version = opts.version;
    this.#maxEntries = opts.maxEntries ?? 100;
    this.#elastiCache = {
      enabled: opts.elastiCache?.enabled ?? true,
      expiration: opts.elastiCache?.expiration ?? { hours: 24 },
    };
    this.#additionalKeyFn = opts.additionalKeyFn;
    this.#dataFn = dataFn;
  }

  /**
   * Retrieves data from the cache or generates fresh data if not found/stale. If ElastiCache is enabled, it will
   * attempt to fetch from there before generating fresh data. Safe to call in parallel.
   *
   * @param ctx - The base context containing logger and elastiCache instances
   * @param args - Arguments used to generate the cache key and data
   * @returns A promise that resolves to the cached or freshly generated data
   */
  async get(ctx: BaseContext, ...args: Args): Promise<T> {
    if (disabled) return this.#dataFn(...args);

    const { logger, stats } = ctx;
    const key = this.keyFromArgs(args);

    // Create a child span for this cache operation for better APM visualization
    return tracer.trace(
      "datacache.get",
      { resource: `datacache.get:${this.#name}`, tags: { "cache.name": this.#name } },
      async (span) => {
        let entry = this.#entries.get(key);
        const wasInMemory = !!entry?.data;

        if (!entry) {
          entry = { key, accessedAt: undefined, pushedAt: undefined, promise: undefined, data: undefined };
          // we have to set the entry immediately so that another code path called in parallel will find the same entry
          this.#entries.set(key, entry);
        }

        // Track whether we hit ElastiCache or generated fresh data
        let hitElastiCache = false;

        // parallel calls to get should not result in multiple calls to ElastiCache, so wrap the core get logic in a promise
        // that is cleared out before returning
        entry.promise ??= (async () => {
          assertDefined(entry);
          if (this.#elastiCache.enabled && ctx.elastiCache) {
            // If we've generated fresh data but haven't pushed it yet, then we can just return since our data should be
            // pushed shortly
            if (entry.data && !entry.pushedAt) return;
            logger.debug(`[DataCache ${this.#name} ${key}] Fetching pushedAt`);
            const pushedAt = await this.elastiCacheGet(ctx, `${key}:pushedAt`, (data) => zdt(data));

            // If we don't have a pushedAt, then we should push fresh data
            if (!pushedAt) {
              logger.debug(`[DataCache ${this.#name} ${key}] ElastiCache data does not exist`);
              // If data doesn't exist in ElastiCache, then the cache must have been cleared
              // intentionally or expired via TTL. We should generate fresh data and push it to ElastiCache.
              entry.pushedAt = undefined;
              entry.data = undefined;
              stats.increment("datacache.elasticache.result", { cache_name: this.#name, result: "miss" });
            } else if (!entry.data || entry.pushedAt?.isBefore(pushedAt)) {
              // If we don't have in-memory data, or it is stale, then we should fetch from the cache and use its push time
              logger.debug(`[DataCache ${this.#name} ${key}] Fetching data from cache`);
              const elastiCacheStartTime = performance.now();
              entry.data = await this.elastiCacheGet(ctx, key, (data) => {
                try {
                  const value = this.#binding.fromJson(JSON.parse(data));
                  logger.debug(`[DataCache ${this.#name} ${key}] Successfully fetched data`);
                  return value;
                } catch (e: any) {
                  // If our shape changes in a deploy, then the cache may still retain data with the previous shape.  If
                  // this happens, then our parse would fail, and we should simply generate new data and store it.
                  logger.error(
                    `[DataCache ${this.#name} ${key}] ${e.constructor.name} parsing JSON "${(e as Error).message}"`,
                  );
                  return undefined;
                }
              });
              const elastiCacheDuration = performance.now() - elastiCacheStartTime;
              stats.distribution("datacache.elasticache.get.duration_ms", elastiCacheDuration, {
                cache_name: this.#name,
              });
              entry.pushedAt = entry.data ? pushedAt : undefined;
              if (entry.data) {
                hitElastiCache = true;
                stats.increment("datacache.elasticache.result", { cache_name: this.#name, result: "hit" });
              } else {
                stats.increment("datacache.elasticache.result", { cache_name: this.#name, result: "miss_parse_error" });
              }
            } else if (entry.data) {
              logger.debug(`[DataCache ${this.#name} ${key}] Using in-memory data`);
            }
          }
          // if we still don't have data, run the generator function
          if (!entry.data) {
            logger.debug(`[DataCache ${this.#name} ${key}] Generating fresh data`);
            const generateStartTime = performance.now();
            entry.data = await this.#dataFn(...args);
            const generateDuration = performance.now() - generateStartTime;
            stats.distribution("datacache.generate.duration_ms", generateDuration, { cache_name: this.#name });
          }
        })().then(() => {
          // clear out our promise so that later calls will retry the full logic
          entry.promise = undefined;
          entry.accessedAt = nowUTC();
        });

        await entry.promise;

        // Determine the result type and record it
        const result = wasInMemory ? "hit_memory" : hitElastiCache ? "hit_elasticache" : "miss";
        stats.increment("datacache.operation", { cache_name: this.#name, result });

        // Tag the span with cache operation results
        span?.setTag("cache.result", result);

        return entry.data!;
      },
    );
  }

  /**
   * Removes a specific entry from both the in-memory cache and ElastiCache (if enabled).
   *
   * @param ctx - The base context containing logger and elastiCache instances
   * @param args - Arguments used to generate the cache key for the entry to delete
   * @returns A promise that resolves when the deletion is complete
   */
  async delete(ctx: BaseContext, ...args: Args): Promise<void> {
    const key = this.keyFromArgs(args);
    this.#entries.delete(key);
    if (this.#elastiCache.enabled) {
      await ctx.elastiCache?.delete([this.elastiCacheKey(key), this.elastiCacheKey(`${key}:pushedAt`)]);
    }
  }

  /**
   * Clears all entries in-memory from memory and ElastiCache (if enabled).
   *
   * @param ctx - The base context containing logger and elastiCache instances
   * @returns A promise that resolves when the cache is cleared
   */
  async clear(ctx: BaseContext): Promise<void> {
    if (this.#elastiCache.enabled) {
      const keys = [...this.#entries.keys()].flatMap((key) => [
        this.elastiCacheKey(key),
        this.elastiCacheKey(`${key}:pushedAt`),
      ]);
      await ctx.elastiCache?.delete(keys);
    }
    this.#entries.clear();
  }

  private keyFromArgs(args: Args): string {
    return (this.#additionalKeyFn ? [...args, this.#additionalKeyFn(...args)] : args)
      .map((arg) => {
        if (isEntity(arg)) {
          return arg.id;
        } else if (Array.isArray(arg)) {
          // Using an array as part of a cache key is code smell that you are probably abusing the cache.  Using such
          // keys is likely to result in a large number of cache entries with a high rate of cache misses. If you are
          // seeing this comment, then you should a different approach that doesn't require array-based keys.
          fail("Arrays are not supported as cache keys");
        } else if (arg instanceof Temporal.ZonedDateTime) {
          // Using epoch milliseconds makes the key more compact (13 characters vs. 31 + time zone string). Reconsider
          // this approach in the year 2,854,231,970,300 CE when this is no longer the case.
          return Math.round(arg.epochMilliseconds).toString();
        } else {
          return `${arg}`;
        }
      })
      .join("-");
  }

  /**
   * Removes excess entries from the in-memory cache.
   *
   * This method performs cleanup by removing least recently used entries when the cache exceeds the maximum entry limit
   * ensuring the cache remains within size limits
   *
   * @private
   */
  private cleanup(ctx: BaseContext) {
    // If the cache is already below the maxEntries limit, then there's nothing to do.
    if (this.#entries.size <= this.#maxEntries) return;
    const numEntriesToDelete = [0, this.#entries.size - this.#maxEntries].max();
    // We're doing a linear scan here which is not great for performance, but the size of the array should be soft
    // capped by maxEntries such that in practice there should never be more than 430 entries here (as of 9/2/2025)
    const entriesToDelete = this.#entries
      .values()
      // If an entry doesn't have an `accessedAt,` then it's still being generated, so we should skip it as it cannot be
      // stale.
      .filter((entry) => isDefined(entry.accessedAt))
      // If an entry has a promise, then it's currently being accessed.  We should skip it so that we don't cause a race
      // condition.
      .filter((entry) => !isDefined(entry.promise))
      // If an entry doesn't have a pushedAt, then it's not in ElastiCache yet. So we should skip it as it cannot be
      // stale.
      .filter((entry) => isDefined(entry.pushedAt))
      .toArray()
      // Sort the array by accessedAt in ascending order so the least recently accessed entries are at the front
      .sortBy((entry) => entry.accessedAt!)
      // We want the total size of `#entries` to be at most `maxEntries` after we're done.  So, we need to remove
      // additional entries from the end of the array.  Since `slice` does a shallow copy from the starting index
      // given, by providing a lower index we get more entries to delete.
      .slice(0, numEntriesToDelete);
    if (entriesToDelete.isEmpty) return;
    const { logger, stats } = ctx;
    logger.debug(
      `[DataCache ${this.#name}] Cleaning up ${entriesToDelete.length} ${pluralize("entry", entriesToDelete.length)} in memory`,
    );
    entriesToDelete.forEach((entry) => this.#entries.delete(entry.key));
    stats.gauge("datacache.size", this.#entries.size, { cache_name: this.#name });
    stats.increment("datacache.evictions", { cache_name: this.#name });
    stats.distribution("datacache.evictions.count", entriesToDelete.length, { cache_name: this.#name });
  }

  private async elastiCacheGet<R>(
    ctx: BaseContext,
    key: string,
    transform?: (data: string) => R,
  ): Promise<R | undefined> {
    if (!isDefined(ctx.elastiCache)) fail("ElastiCache is not available");
    const data = await ctx.elastiCache.get(this.elastiCacheKey(key));
    return isDefined(data) && transform ? transform(data) : undefined;
  }

  private async elastiCacheSet(ctx: BaseContext, values: Record<string, string>): Promise<boolean> {
    if (!isDefined(ctx.elastiCache)) fail("ElastiCache is not available");
    values = values.toEntries().mapToObject(([key, value]) => [this.elastiCacheKey(key), value]);
    ctx.logger.debug(
      `[DataCache ${this.#name}] Setting ${Object.keys(values).length} keys in ElastiCache with total size ${values.toValues().sum((v) => v.length)} bytes`,
    );
    return ctx.elastiCache.mset(values, { expiration: this.#elastiCache.expiration });
  }

  private elastiCacheKey(key: string): string {
    return `${this.#name}:${this.#version}:${key}`;
  }

  /**
   * Pushes any unpushed cache entries to ElastiCache.
   *
   * This method synchronizes the in-memory cache with ElastiCache by pushing any entries
   * that haven't been pushed yet. It handles serialization of the data and manages
   * the pushed timestamp. Multiple concurrent push attempts are coordinated through
   * a promise-based locking mechanism.
   *
   * @param ctx - The base context containing logger and elastiCache instances
   * @returns A promise that resolves when the push operation is complete
   * @private
   */
  private async push(ctx: BaseContext): Promise<void> {
    if (!this.#elastiCache.enabled) return;
    if (!ctx.elastiCache) return;
    this.#pushPromise ??= (async () => {
      const entries = this.#entries
        .values()
        .filter((entry) => !isDefined(entry.pushedAt))
        // If an entry has a promise, then it's currently being accessed or generated which might change its data.  To
        // avoid potential race conditions, we can simply wait to push until the next time we are called.  This could
        // still result in a race condition where separate *processes* could push over each other, but the risk there
        // seems low and the only consequence would be slightly stale data. This seems like an acceptable risk.
        .filter((entry) => !isDefined(entry.promise))
        // In theory if we don't have a promise, then data should be present, but as a sanity check so we can assert
        // later, we'll make sure.
        .filter((entry) => isDefined(entry.data))
        .toArray();
      if (entries.isEmpty) return;
      const pushedAt = nowUTC();
      const data = entries.flatMap((entry) => {
        const json = JSON.stringify(this.#binding.toJson(entry.data!));
        return [
          [entry.key, json],
          [`${entry.key}:pushedAt`, pushedAt.toString()],
        ] as [string, string][];
      });
      const success = await this.elastiCacheSet(ctx, data.toObject());
      if (success) entries.forEach((entry) => (entry.pushedAt = pushedAt));
    })().then(() => {
      this.#pushPromise = undefined;
    });
    await this.#pushPromise;
  }

  private setEntries(entries: CacheEntry<T>[]) {
    this.#entries = new Map(entries.map((entry) => [entry.key, entry]));
  }

  private getEntries(): Map<string, CacheEntry<T>> {
    return this.#entries;
  }

  static disable(): void {
    disabled = true;
  }

  static enable(): void {
    disabled = false;
  }

  /**
   * Cleans up all registered cache instances by removing excess entries.
   *
   * This static method iterates through all registered cache instances and triggers
   * their individual cleanup processes. Each cache will ensure the cache size remains
   * within its configured limits by removing least recently used entries.
   *
   * @param ctx - The base context containing logger and elastiCache instances
   */
  static cleanup(ctx: BaseContext): void {
    caches.forEach((cache) => cache.cleanup(ctx));
  }

  /**
   * Pushes all unpushed cache entries from all cache instances to ElastiCache.
   *
   * This method iterates through all registered cache instances and synchronizes
   * their in-memory data with ElastiCache by calling push on each instance.
   *
   * @param ctx - The base context containing logger and elastiCache instances
   * @returns A promise that resolves when all caches have completed pushing their data
   */
  static async push(ctx: BaseContext): Promise<void> {
    await caches.asyncForEach((cache) => cache.push(ctx));
  }

  static async clear(ctx: BaseContext): Promise<void> {
    await caches.asyncForEach((cache) => cache.clear(ctx));
  }

  /**
   * Creates a new DataCache instance with the specified configuration.
   *
   * @param opts - Configuration object
   *  - name: Unique identifier for the cache instance
   *  - binding: JSON binding for serializing/deserializing cached data
   *  - version: Version string to use for cache keys. Optional
   *  - maxEntries: Maximum number of entries allowed in the cache. Optional. Default: 100
   *  - additionalKeyFn: Optional function that returns a string value to append to the base cache key.
   *           Receives the same arguments as dataFn. Useful for adding freshness/versioning to cache keys.
   *           EG: additionalKeyFn: (pof, rpav) => rpav.isDraft ? "draft" : "published"
   *  - elastiCache: Configuration for ElastiCache usage. Optional
   *    - enabled: Whether to enable ElastiCache for this cache instance. Optional. Default: true
   *    - expiration: Timeout duration for ElastiCache entries. Optional.  Default: 24 hours
   * @param dataFn - Function that generates fresh data when cache miss occurs
   * @returns A new DataCache instance
   * @template T - Type of the cached data
   * @template A - Type of the argument array passed to dataFn
   */
  static create<T, A extends Array<any>>(opts: DataCacheOpts<T>, dataFn: (...args: A) => Promise<T>): DataCache<T, A> {
    const cache = new DataCache(opts, dataFn);
    caches.push(cache);
    return cache;
  }

  /**
   * Retrieves a DataCache instance by its name.
   *
   * @param name - The unique identifier of the cache instance to retrieve
   * @returns The DataCache instance with the specified name, or undefined if not found
   */
  static get(name: string): DataCache<any, any> | undefined {
    return caches.find((cache) => cache.#name === name);
  }
}

// exported for testing
export function getEntries<T, A extends any[]>(cache: DataCache<T, A>): CacheEntry<T>[] {
  return [...cache["getEntries"]().values()];
}

// exported for testing
export function clearCaches() {
  caches = [];
}

// exported for testing
export function newEntry<T, A extends any[]>(cache: DataCache<T, A>, opts: Partial<CacheEntry<T>> = {}): CacheEntry<T> {
  const entries = cache["getEntries"]();
  let { key = `key:${entries.size + 1}`, accessedAt, pushedAt, data, promise } = opts;
  if (!("accessedAt" in opts)) accessedAt = nowUTC();
  if (!("pushedAt" in opts)) pushedAt = accessedAt;
  const entry = { key, accessedAt, pushedAt: pushedAt, promise, data };
  entries.set(key, entry);
  return entry;
}

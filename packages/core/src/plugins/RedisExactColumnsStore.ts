import { createHash } from "node:crypto";

import {
  ExactColumnsProfileRejectedError,
  type ExactColumnsStoreAdapter,
  type ExactColumnsStoreKey,
  type ExactColumnsStoreUpdate,
  validateStoredProfile,
} from "./ExactColumnsStoreAdapter.ts";

export interface RedisExactColumnsStoreOpts {
  /** Pass node-redis's sendCommand, or adapt ioredis's call. The application owns the connection. */
  sendCommand: (args: string[]) => Promise<unknown>;
  /** Defaults to seven days; successful requests periodically republish settled hints. */
  ttlSeconds?: number;
}

/** Redis/Valkey hint storage without a dependency on a particular Redis client. */
export class RedisExactColumnsStore implements ExactColumnsStoreAdapter {
  private readonly sendCommand: RedisExactColumnsStoreOpts["sendCommand"];
  private readonly ttlSeconds: number;

  constructor(opts: RedisExactColumnsStoreOpts) {
    this.sendCommand = opts.sendCommand;
    this.ttlSeconds = opts.ttlSeconds ?? 7 * 24 * 60 * 60;
    if (!Number.isSafeInteger(this.ttlSeconds) || this.ttlSeconds <= 0)
      throw new Error("ttlSeconds must be a positive integer");
  }

  /** Read the last published hint, regardless of which deployment produced it. */
  async load(key: ExactColumnsStoreKey) {
    const value = await this.sendCommand(["GET", cacheKey(key)]);
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "string") throw new ExactColumnsProfileRejectedError("Invalid exact-columns cache value");
    let profile: unknown;
    try {
      profile = JSON.parse(value);
    } catch {
      throw new ExactColumnsProfileRejectedError("Invalid exact-columns JSON");
    }
    validateStoredProfile(profile);
    return profile;
  }

  /** Last publication wins. Delayed or competing saves only affect future processes' starting hints. */
  async save(update: ExactColumnsStoreUpdate): Promise<void> {
    const profile = { ...update.snapshot, codeVersion: update.codeVersion, updatedAt: Date.now() };
    await this.sendCommand(["SET", cacheKey(update), JSON.stringify(profile), "EX", String(this.ttlSeconds)]);
  }
}

/** Hash application/endpoint identities; codeVersion is provenance, not a separate cache entry. */
function cacheKey(key: ExactColumnsStoreKey): string {
  const identity = createHash("sha256")
    .update(JSON.stringify([key.namespace, key.endpointKey]))
    .digest("hex");
  return `joist:exact-columns:2:${identity}`;
}

import { createHash, randomUUID } from "node:crypto";

import type {
  ExactColumnsStoreAdapter,
  ExactColumnsStoreKey,
  ExactColumnsStoreUpdate,
  ExactColumnsStoredProfile,
} from "./ExactColumnsStoreAdapter.ts";

export interface RedisExactColumnsStoreOpts {
  /** Pass node-redis's sendCommand, or adapt ioredis's call. The application owns the connection. */
  sendCommand: (args: string[]) => Promise<unknown>;
  /** Defaults to seven days; active profiles are renewed by the plugin. */
  ttlSeconds?: number;
}

/** Redis/Valkey storage without a dependency on a particular Redis client. */
export class RedisExactColumnsStore implements ExactColumnsStoreAdapter {
  private readonly sendCommand: RedisExactColumnsStoreOpts["sendCommand"];
  private readonly ttlSeconds: number;

  constructor(opts: RedisExactColumnsStoreOpts) {
    this.sendCommand = opts.sendCommand;
    this.ttlSeconds = opts.ttlSeconds ?? 7 * 24 * 60 * 60;
    if (!Number.isSafeInteger(this.ttlSeconds) || this.ttlSeconds <= 0)
      throw new Error("ttlSeconds must be a positive integer");
  }

  /** Both keys share a Redis Cluster slot, so lookup and publication work on clustered Valkey too. */
  async load(key: ExactColumnsStoreKey) {
    const keys = cacheKeys(key);
    const result = await this.sendCommand(["MGET", ...keys]);
    if (!Array.isArray(result) || result.length !== 2) throw new Error("Invalid exact-columns MGET response");
    return { version: decode(result[0]), seed: decode(result[1]) };
  }

  /** Atomically preserves discoveries and fences stale workers from restoring narrowed mode. */
  async merge(update: ExactColumnsStoreUpdate) {
    const result = await this.sendCommand([
      "EVAL",
      mergeScript,
      "2",
      ...cacheKeys(update),
      JSON.stringify(update.snapshot),
      update.expectedRevision ?? "",
      update.invalidate ? "1" : "0",
      update.publishSeed ? "1" : "0",
      update.codeVersion,
      String(Date.now()),
      randomUUID(),
      String(this.ttlSeconds),
    ]);
    if (!Array.isArray(result) || result.length !== 2) throw new Error("Invalid exact-columns merge response");
    const profile = decode(result[0]);
    if (!profile) throw new Error("Missing exact-columns merge response");
    return { profile, conflict: Number(result[1]) === 1 };
  }
}

// A seed is replaced, not unioned across releases. Revision UUIDs prevent ABA after key expiration.
// I.e. worker B cannot settle revision X after worker A widened X to Y, even if B's reads succeeded.
const mergeScript = `
local incoming = cjson.decode(ARGV[1])
local raw = redis.call('GET', KEYS[1])
local current = raw and cjson.decode(raw) or nil
local conflict = (current and current.revision ~= ARGV[2]) or (not current and ARGV[2] ~= '')
local grew = false
if current then
  for name, entity in pairs(incoming.entities) do
    local existing = current.entities[name]
    if not existing then
      current.entities[name] = entity
      grew = true
    else
      if existing.table ~= entity.table then return redis.error_reply('Exact columns model changed within codeVersion') end
      for field, _ in pairs(entity.fields) do
        if not existing.fields[field] then existing.fields[field] = true; grew = true end
      end
    end
  end
else
  current = incoming
  if conflict then current.state = 'learning' end
end
local invalidate = ARGV[3] == '1'
if not raw or grew or invalidate then current.revision = ARGV[7] end
if invalidate or grew then
  current.state = 'learning'
elseif incoming.state == 'settled' and not conflict then
  current.state = 'settled'
end
if conflict then
  current.instability = math.max(current.instability, incoming.instability)
else
  current.instability = incoming.instability
end
current.codeVersion = ARGV[5]
current.updatedAt = tonumber(ARGV[6])
local encoded = cjson.encode(current)
redis.call('SET', KEYS[1], encoded, 'EX', ARGV[8])
if ARGV[4] == '1' and current.state == 'settled' and not conflict then
  redis.call('SET', KEYS[2], encoded, 'EX', ARGV[8])
end
return {encoded, conflict and 1 or 0}
`;

/** Hash user-controlled identities, including braces, before constructing the cluster hash tag. */
function cacheKeys(key: ExactColumnsStoreKey): [string, string] {
  const slot = createHash("sha256")
    .update(JSON.stringify([key.namespace, key.endpointKey]))
    .digest("hex");
  const version = createHash("sha256").update(key.codeVersion).digest("hex");
  const prefix = `joist:exact-columns:1:{${slot}}`;
  return [`${prefix}:version:${version}`, `${prefix}:seed`];
}

/** Reject corrupt cache data before it can control a SELECT projection. */
function decode(value: unknown): ExactColumnsStoredProfile | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") throw new Error("Invalid exact-columns cache value");
  const profile = JSON.parse(value) as ExactColumnsStoredProfile;
  if (
    !profile ||
    typeof profile !== "object" ||
    !profile.entities ||
    Array.isArray(profile.entities) ||
    typeof profile.entities !== "object" ||
    !["learning", "settled"].includes(profile.state) ||
    !Number.isSafeInteger(profile.instability) ||
    profile.instability < 0 ||
    typeof profile.revision !== "string" ||
    !profile.revision ||
    typeof profile.codeVersion !== "string" ||
    !Number.isFinite(profile.updatedAt)
  )
    throw new Error("Invalid exact-columns profile");
  for (const entity of Object.values(profile.entities)) {
    if (
      !entity ||
      typeof entity.table !== "string" ||
      !entity.fields ||
      typeof entity.fields !== "object" ||
      Array.isArray(entity.fields) ||
      Object.values(entity.fields).some((v) => v !== true)
    ) {
      throw new Error("Invalid exact-columns entity profile");
    }
  }
  return profile;
}

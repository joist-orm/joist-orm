import { createHash, randomUUID } from "node:crypto";

import {
  ExactColumnsProfileRejectedError,
  type ExactColumnsStoreAdapter,
  type ExactColumnsStoreKey,
  type ExactColumnsStoreUpdate,
  type ExactColumnsStoredProfile,
  validateStoredProfile,
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
    if (!Array.isArray(result) || result.length !== 2)
      throw new ExactColumnsProfileRejectedError("Invalid exact-columns MGET response");
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
    if (!Array.isArray(result) || result.length !== 2)
      throw new ExactColumnsProfileRejectedError("Invalid exact-columns merge response");
    if (result[0] === "rejected") throw new ExactColumnsProfileRejectedError(String(result[1]));
    const profile = decode(result[0]);
    if (!profile) throw new ExactColumnsProfileRejectedError("Missing exact-columns merge response");
    return { profile, conflict: Number(result[1]) === 1 };
  }
}

// A seed is replaced, not unioned across releases. Revision UUIDs prevent ABA after key expiration.
// I.e. worker B cannot settle revision X after worker A widened X to Y, even if B's reads succeeded.
const mergeScript = `
local incoming = cjson.decode(ARGV[1])
local raw = redis.call('GET', KEYS[1])
local current = nil
if raw then
  local valid, decoded = pcall(cjson.decode, raw)
  if not valid or type(decoded) ~= 'table' or type(decoded.entities) ~= 'table'
    or type(decoded.revision) ~= 'string' or decoded.revision == ''
    or decoded.codeVersion ~= ARGV[5] or type(decoded.updatedAt) ~= 'number'
    or (decoded.state ~= 'learning' and decoded.state ~= 'settled')
    or type(decoded.instability) ~= 'number' or decoded.instability < 0
    or decoded.instability > 9007199254740991 or decoded.instability ~= math.floor(decoded.instability) then
    return {'rejected', 'Invalid exact-columns profile'}
  end
  current = decoded
  for _, entity in pairs(current.entities) do
    if type(entity) ~= 'table' or type(entity.table) ~= 'string' or type(entity.fields) ~= 'table' then
      return {'rejected', 'Invalid exact-columns entity profile'}
    end
    for _, observed in pairs(entity.fields) do
      if observed ~= true then return {'rejected', 'Invalid exact-columns field observation'} end
    end
  end
end
local conflict = (current and current.revision ~= ARGV[2]) or (not current and ARGV[2] ~= '')
local grew = false
if current then
  for name, entity in pairs(incoming.entities) do
    local existing = current.entities[name]
    if not existing then
      current.entities[name] = entity
      grew = true
    else
      if existing.table ~= entity.table then return {'rejected', 'Exact columns model changed within codeVersion'} end
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
elseif current.state == 'settled' then
  -- Keep an actively used seed alive without allowing older workers to replace its content.
  redis.call('EXPIRE', KEYS[2], ARGV[8])
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

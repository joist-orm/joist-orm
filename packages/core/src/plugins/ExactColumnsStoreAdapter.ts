/** Portable field observations; SQL columns are always derived from the running model. */
export interface ExactColumnsSnapshot {
  entities: Record<string, { table: string; fields: Record<string, true> }>;
}

/** A hint saved by a locally settled endpoint; learning state stays in the originating process. */
export interface ExactColumnsStoredProfile extends ExactColumnsSnapshot {
  codeVersion: string;
  updatedAt: number;
}

export interface ExactColumnsStoreKey {
  namespace: string;
  codeVersion: string;
  endpointKey: string;
}

export interface ExactColumnsStoreUpdate extends ExactColumnsStoreKey {
  snapshot: ExactColumnsSnapshot;
}

/** One best-effort hint per namespace/endpoint. Saves replace it; readers never coordinate learning. */
export interface ExactColumnsStoreAdapter {
  load(key: ExactColumnsStoreKey): Promise<ExactColumnsStoredProfile | undefined>;
  save(update: ExactColumnsStoreUpdate): Promise<void>;
}

/** A bad hint is a cache miss, not evidence of a connection outage. */
export class ExactColumnsProfileRejectedError extends Error {}

export interface ExactColumnsCacheEvent {
  endpointKey: string;
  operation: "load" | "save" | "adopt" | "promote" | "settle" | "deoptimize" | "reject";
  result: "success" | "miss" | "error" | "timeout" | "backoff";
  durationMs?: number;
  error?: unknown;
  codeVersion?: string;
  sourceCodeVersion?: string;
  mode?: "learning" | "provisional" | "narrow";
}

export interface ExactColumnsStoreOpts {
  store: ExactColumnsStoreAdapter;
  namespace: string;
  codeVersion: string;
  /** Maximum time to wait for a cache operation. Defaults to 50 ms. */
  timeoutMs?: number;
  /** Successful requests republish settled hints at most this often. Defaults to 60 seconds. */
  publishIntervalMs?: number;
  /** Maximum queued endpoints, excluding the one in flight. Defaults to 1000. */
  maxPending?: number;
  /** Synchronous, exception-isolated telemetry. */
  onCacheEvent?: (event: ExactColumnsCacheEvent) => void;
}

/**
 * Validate adapter data before it can control narrowing or escape from a background task.
 *
 * Custom adapters have the same runtime boundary as decoded Redis data. A malformed response is
 * an endpoint-specific rejection, not evidence that the cache connection is down.
 */
export function validateStoredProfile(value: unknown): asserts value is ExactColumnsStoredProfile {
  const profile = value as ExactColumnsStoredProfile;
  if (
    !profile ||
    typeof profile !== "object" ||
    !profile.entities ||
    Array.isArray(profile.entities) ||
    typeof profile.entities !== "object" ||
    typeof profile.codeVersion !== "string" ||
    !Number.isFinite(profile.updatedAt)
  )
    throw new ExactColumnsProfileRejectedError("Invalid exact-columns profile");
  for (const entity of Object.values(profile.entities)) {
    if (
      !entity ||
      typeof entity.table !== "string" ||
      !entity.fields ||
      typeof entity.fields !== "object" ||
      Array.isArray(entity.fields) ||
      Object.values(entity.fields).some((v) => v !== true)
    ) {
      throw new ExactColumnsProfileRejectedError("Invalid exact-columns entity profile");
    }
  }
}

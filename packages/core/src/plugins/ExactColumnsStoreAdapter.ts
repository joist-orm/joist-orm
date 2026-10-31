/** Portable field observations; SQL columns are always derived from the running model. */
export interface ExactColumnsSnapshot {
  entities: Record<string, { table: string; fields: Record<string, true> }>;
  state: "learning" | "settled";
  instability: number;
}

/** A revision identifies one field union and its invalidation epoch, including across expiration. */
export interface ExactColumnsStoredProfile extends ExactColumnsSnapshot {
  revision: string;
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
  expectedRevision: string | undefined;
  /** Invalidate readiness even when the missing field was already discovered by another worker. */
  invalidate: boolean;
  /** Publish a seed only on a locally earned transition to settled, never on TTL renewal. */
  publishSeed: boolean;
}

/** Stores must atomically union same-version fields and reject stale settled publications. */
export interface ExactColumnsStoreAdapter {
  load(key: ExactColumnsStoreKey): Promise<{
    version?: ExactColumnsStoredProfile;
    seed?: ExactColumnsStoredProfile;
  }>;
  merge(update: ExactColumnsStoreUpdate): Promise<{
    profile: ExactColumnsStoredProfile;
    conflict: boolean;
  }>;
}

export interface ExactColumnsCacheEvent {
  endpointKey: string;
  operation: "load" | "merge" | "refresh" | "adopt" | "promote" | "settle" | "deoptimize" | "reject";
  result: "success" | "miss" | "error" | "timeout" | "backoff" | "conflict";
  durationMs?: number;
  error?: unknown;
  codeVersion?: string;
  sourceCodeVersion?: string;
  revision?: string;
  mode?: "learning" | "provisional" | "narrow";
}

export interface ExactColumnsPersistenceOpts {
  store: ExactColumnsStoreAdapter;
  namespace: string;
  codeVersion: string;
  /** Maximum time to wait for a cache operation. Defaults to 50 ms. */
  timeoutMs?: number;
  /** Active profiles refresh and renew their TTL in the background. Defaults to 60 seconds. */
  refreshIntervalMs?: number;
  /** Maximum queued endpoints, excluding the one in flight. Defaults to 1000. */
  maxPending?: number;
  /** Synchronous, exception-isolated telemetry. */
  onCacheEvent?: (event: ExactColumnsCacheEvent) => void;
}

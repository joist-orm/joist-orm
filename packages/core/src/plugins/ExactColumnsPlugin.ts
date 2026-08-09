import { AsyncLocalStorage } from "async_hooks";

import { getInstanceData } from "../BaseEntity.ts";
import { loadOperation } from "../batchloaders/loadBatchLoader.ts";
import { oneToManyLoadOperation } from "../batchloaders/oneToManyBatchLoader.ts";
import { oneToOneLoadOperation } from "../batchloaders/oneToOneBatchLoader.ts";
import { findOperation } from "../dataloaders/findDataLoader.ts";
import { oneToManyFindOperation } from "../dataloaders/oneToManyFindDataLoader.ts";
import { type Entity } from "../Entity.ts";
import { EntityManager, type FindOperation, type MaybeAbstractEntityConstructor } from "../EntityManager.ts";
import { type EntityMetadata, getMetadata } from "../EntityMetadata.ts";
import { kq, kqDot } from "../keywords.ts";
import { Plugin } from "../PluginManager.ts";
import { type ParsedFindQuery } from "../QueryParser.ts";

export interface ExactColumnsPluginOpts {
  /**
   * How many full-row invocations to observe per endpoint key before narrowing SELECTs, default `5`.
   *
   * Learning only needs to see an endpoint's common branches — a rarely-taken branch missed at any
   * `learnFor` costs one stale retry ever, then permanently widens the profile — so keep this low
   * enough that low-traffic endpoints still graduate between deploys/process restarts.
   */
  learnFor?: number;
  /** Called when a narrowed endpoint reads an un-fetched column, i.e. for telemetry, before the retry/rethrow. */
  onStale?: (err: StaleColumnUsageError) => void;
}

/** The per-endpoint report shape, i.e. `{ invocations: 51, staleRetries: 1, staleFailures: 0, entities: { Author: ["firstName"] } }`. */
export interface ExactColumnsReport {
  [endpointKey: string]: {
    invocations: number;
    /** Stales that were safely retried, i.e. the invocation had not flushed yet. */
    staleRetries: number;
    /** Stales that failed the invocation, i.e. a flush had committed so re-running was unsafe. */
    staleFailures: number;
    entities: Record<string, string[]>;
  };
}

/**
 * Thrown when code reads a field whose column was pruned from the SELECT by a narrowed profile.
 *
 * `ExactColumnsPlugin.track` catches this, widens the endpoint's profile, and re-invokes the
 * endpoint once with full rows; an escaped instance (i.e. outside any `track` scope) is a loud
 * failure by design, because it prevented a silently-wrong `undefined` read.
 */
export class StaleColumnUsageError extends Error {
  constructor(
    readonly entity: Entity,
    readonly fieldName: string,
    readonly endpointKey: string | undefined,
  ) {
    super(
      `${entity}.${fieldName} was read, but its column was not fetched` +
        (endpointKey ? ` (endpoint "${endpointKey}")` : ""),
    );
  }
}

/**
 * An opt-in plugin that learns which columns each endpoint actually reads, then narrows SELECTs.
 *
 * Wrap each endpoint in `plugin.track(key, fn)`: the first `learnFor` invocations keep Joist's
 * usual `SELECT a.*` while recording which fields are read; afterwards, SELECTs for that endpoint
 * only fetch the used columns (plus the pk and timestamp columns). A novel codepath that
 * reads an un-fetched column throws {@link StaleColumnUsageError}, which `track` catches: it adds
 * the field to the profile and re-invokes `fn` once with full rows — unless the invocation had
 * already flushed, in which case re-running `fn` would re-execute committed writes, so the error
 * propagates instead and the widened profile fixes the next invocation. (A stale *during* a flush
 * aborts that flush's transaction, so nothing commits and the retry stays safe.)
 *
 * Create one plugin instance app-wide and register it on every EntityManager:
 *
 * ```ts
 * export const exactColumns = new ExactColumnsPlugin();
 * // in the EM factory
 * em.addPlugin(exactColumns);
 * // per endpoint
 * app.get("/authors/:id", (req, res) => exactColumns.track("GET /authors/:id", async () => ...));
 * ```
 *
 * Requirements: each `track(fn)` invocation must create its own EntityManager (the stale-retry
 * re-invokes `fn`, and an EM whose flush aborted is not reusable), and an EM must not span two
 * track scopes. Profiles are in-memory only, so each process restart re-learns.
 */
export class ExactColumnsPlugin extends Plugin {
  readonly #learnFor: number;
  readonly #onStale: ((err: StaleColumnUsageError) => void) | undefined;
  readonly #profiles: Map<string, EndpointProfile> = new Map();
  /** Late-binds EMs to their track scope, i.e. for faults that outlive the ALS context. */
  readonly #emScopes: WeakMap<EntityManager, TrackScope> = new WeakMap();

  constructor(opts: ExactColumnsPluginOpts = {}) {
    super();
    this.#learnFor = opts.learnFor ?? 5;
    this.#onStale = opts.onStale;
  }

  /** Runs one endpoint invocation, learning during the first `learnFor` calls and narrowing after. */
  async track<T>(key: string, fn: () => Promise<T>): Promise<T> {
    let profile = this.#profiles.get(key);
    if (!profile) {
      profile = { key, invocations: 0, staleRetries: 0, staleFailures: 0, perMeta: new Map() };
      this.#profiles.set(key, profile);
    }
    profile.invocations++;
    const scope: TrackScope = { profile, narrow: profile.invocations > this.#learnFor, flushed: false };
    try {
      return await scopes.run(scope, fn);
    } catch (err) {
      if (!(err instanceof StaleColumnUsageError)) throw err;
      // Learn the missed field either way, so the next invocation's selects include it
      recordField(profile, getMetadata(err.entity).cstr, err.fieldName);
      this.#onStale?.(err);
      // Once a flush has written, re-running `fn` would re-execute the committed mutations
      // (i.e. double-writing), so fail this invocation loudly instead of silently retrying
      if (scope.flushed) {
        profile.staleFailures++;
        throw err;
      }
      // Otherwise re-invoke once with full rows so the fault hook records every other field
      // the novel codepath reads; a second stale (i.e. a bug) propagates.
      profile.staleRetries++;
      return await scopes.run({ profile, narrow: false, flushed: false }, fn);
    }
  }

  /** Returns the per-endpoint learned profiles, i.e. for logging or debugging. */
  getReport(): ExactColumnsReport {
    const report: ExactColumnsReport = {};
    for (const [key, profile] of this.#profiles) {
      const entities: Record<string, string[]> = {};
      for (const [cstr, metaProfile] of profile.perMeta) {
        entities[cstr.name] = [...metaProfile.fields].sort();
      }
      report[key] = {
        invocations: profile.invocations,
        staleRetries: profile.staleRetries,
        staleFailures: profile.staleFailures,
        entities,
      };
    }
    return report;
  }

  /** Records fault-granularity field reads, and guards reads of columns a narrowed SELECT pruned. */
  beforeGetFieldFault(entity: Entity, fieldName: string): void {
    const scope = this.#resolveScope(entity.em);
    const field = getMetadata(entity).allFields[fieldName];
    // Fields without a serde have no column to profile; let getField fail on them as usual
    if (!field?.serde) return;
    if (scope) recordField(scope.profile, getMetadata(entity).cstr, fieldName);
    // The guard runs even without a scope, i.e. so escaped/forked partial entities fail loudly
    // instead of caching an `undefined` that is indistinguishable from SQL NULL
    const { rowData, rowIndex } = getInstanceData(entity);
    for (const column of field.serde.columns) {
      if (!rowData.has(rowIndex, column.columnName)) {
        throw new StaleColumnUsageError(entity, fieldName, scope?.profile.key);
      }
    }
  }

  /** Narrows the primary table's `alias.*` select to the profile's learned columns. */
  beforeFind(meta: EntityMetadata, operation: FindOperation, query: ParsedFindQuery): void {
    const scope = scopes.getStore();
    if (!scope || !scope.narrow) return;
    // STI/CTI hydration probes discriminator/subtype columns outside of getField, so never narrow them
    if (meta.inheritanceType !== undefined) return;
    if (!narrowableOperations.has(operation)) return;
    // Only narrow metas we saw reads for; a type first touched post-learning keeps full rows
    // (and gets recorded by the fault hook), so the next invocation narrows it without a stale
    const metaProfile = scope.profile.perMeta.get(meta.cstr);
    if (!metaProfile) return;
    const narrowed = getNarrowedColumns(meta, metaProfile);
    if (!narrowed) return;
    const primary = query.tables.find((t) => t.join === "primary");
    if (!primary || primary.table !== meta.tableName) return;
    const { alias } = primary;
    // Loaders emit either `"a".*` (batch loaders) or `a.*` (parseFindQuery's `kq`), so match both
    const starIndex = query.selects.findIndex((s) => s === `"${alias}".*` || s === `${kq(alias)}.*`);
    if (starIndex !== -1) {
      query.selects.splice(starIndex, 1, ...narrowed.kept.map((c) => kqDot(alias, c)));
    } else if (meta.hasLazyColumns) {
      // Lazy-column entities already enumerate columns explicitly, so drop the pruned entries
      const pruned = new Set(narrowed.pruned.map((c) => kqDot(alias, c)));
      query.selects = query.selects.filter((s) => typeof s !== "string" || !pruned.has(s));
    }
  }

  /** Marks the current invocation as having flushed, i.e. so a later stale fails instead of retrying. */
  afterWrite(): void {
    const scope = scopes.getStore();
    if (scope) scope.flushed = true;
  }

  /** Forked EMs keep the same plugin instance, i.e. so their partial entities stay guarded. */
  maybeCloneForNewEm(): this {
    return this;
  }

  /** Resolves the active track scope, i.e. the ALS store or the EM's last-seen scope. */
  #resolveScope(em: EntityManager): TrackScope | undefined {
    const scope = scopes.getStore();
    if (scope) {
      this.#emScopes.set(em, scope);
      return scope;
    }
    return this.#emScopes.get(em);
  }
}

interface EndpointProfile {
  key: string;
  invocations: number;
  staleRetries: number;
  staleFailures: number;
  perMeta: Map<MaybeAbstractEntityConstructor<any>, MetaProfile>;
}

interface MetaProfile {
  fields: Set<string>;
  /** The cached narrow set, rebuilt whenever `fields` has grown since `builtAt`. */
  narrowed?: { builtAt: number; columns: NarrowedColumns | undefined };
}

interface TrackScope {
  profile: EndpointProfile;
  narrow: boolean;
  /** Whether this invocation has flushed writes, i.e. after which a stale must not auto-retry. */
  flushed: boolean;
}

interface NarrowedColumns {
  kept: string[];
  pruned: string[];
}

const scopes = new AsyncLocalStorage<TrackScope>();

/** The operations whose select lists are safe to narrow; everything else keeps its existing selects. */
const narrowableOperations: ReadonlySet<FindOperation> = new Set([
  loadOperation,
  findOperation,
  oneToManyLoadOperation,
  oneToManyFindOperation,
  oneToOneLoadOperation,
]);

/** Adds `fieldName` to the profile's per-type used-field set, i.e. `Author -> { firstName }`. */
function recordField(profile: EndpointProfile, cstr: MaybeAbstractEntityConstructor<any>, fieldName: string): void {
  let metaProfile = profile.perMeta.get(cstr);
  if (!metaProfile) {
    metaProfile = { fields: new Set() };
    profile.perMeta.set(cstr, metaProfile);
  }
  metaProfile.fields.add(fieldName);
}

/**
 * Splits `meta`'s columns into kept vs pruned for a profile, or undefined if nothing prunes.
 *
 * Every unused column prunes — primitives, enums, and m2o/poly FKs alike (relation loaders read
 * FKs through `getField`, so used FKs are recorded like any other field) — except the pk and the
 * created/updated/deleted timestamp columns (i.e. oplock + soft-delete machinery reads those on
 * every write), and `lazy` columns stay excluded exactly as they are today.
 */
function getNarrowedColumns(meta: EntityMetadata, metaProfile: MetaProfile): NarrowedColumns | undefined {
  if (metaProfile.narrowed && metaProfile.narrowed.builtAt === metaProfile.fields.size) {
    return metaProfile.narrowed.columns;
  }
  const { timestampFields: ts } = meta;
  const kept: string[] = [];
  const pruned: string[] = [];
  for (const field of Object.values(meta.fields)) {
    if (!field.serde) continue;
    if (field.kind === "primitive" && field.lazy) continue;
    const isTimestamp =
      field.fieldName === ts?.createdAt || field.fieldName === ts?.updatedAt || field.fieldName === ts?.deletedAt;
    const keep = field.kind === "primaryKey" || isTimestamp || metaProfile.fields.has(field.fieldName);
    for (const column of field.serde.columns) {
      (keep ? kept : pruned).push(column.columnName);
    }
  }
  const columns = pruned.length > 0 ? { kept, pruned } : undefined;
  metaProfile.narrowed = { builtAt: metaProfile.fields.size, columns };
  return columns;
}

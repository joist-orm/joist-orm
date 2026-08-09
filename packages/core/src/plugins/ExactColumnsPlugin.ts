import { AsyncLocalStorage } from "async_hooks";

import { getInstanceData } from "../BaseEntity.ts";
import { loadOperation } from "../batchloaders/loadBatchLoader.ts";
import { oneToManyLoadOperation } from "../batchloaders/oneToManyBatchLoader.ts";
import { oneToOneLoadOperation } from "../batchloaders/oneToOneBatchLoader.ts";
import { findOperation } from "../dataloaders/findDataLoader.ts";
import { oneToManyFindOperation } from "../dataloaders/oneToManyFindDataLoader.ts";
import { type Entity } from "../Entity.ts";
import { type FindOperation, type MaybeAbstractEntityConstructor } from "../EntityManager.ts";
import { type EntityMetadata, getMetadata } from "../EntityMetadata.ts";
import { kq, kqDot } from "../keywords.ts";
import { Plugin } from "../PluginManager.ts";
import { type ParsedFindQuery } from "../QueryParser.ts";

export interface ExactColumnsPluginOpts {
  /** Called when a narrowed endpoint reads an un-fetched column, i.e. for telemetry, before the retry/rethrow. */
  onMissingColumn?: (err: MissingColumnError) => void;
  /** Synchronously reports once when track finishes, including errors and retries. Callback throws are ignored. */
  onTrack?: (outcome: ExactColumnsTrackOutcome) => void;
}

/** Whether an endpoint profile is observing full rows or issuing narrowed SELECTs. */
type ExactColumnsProfileMode = "learning" | "narrow";

/**
 * One invocation's outcomes; the plugin owns learning and the application owns aggregation.
 *
 * Columns cover supported non-inheritance primary projections, not joined/preloaded columns.
 * Counts are per query preparation, before batching/cache lookup, not per SQL execution or row.
 * I.e. two batched Author finds count two projections even if they execute as one SELECT.
 */
export interface ExactColumnsTrackOutcome {
  readonly endpointKey: string;
  /** Whether at least one supported query projection had columns removed. */
  readonly optimized: boolean;
  /** Whether a missing-column retry started, regardless of whether it succeeded. */
  readonly retried: boolean;
  /** Whether committed writes prevented a missing-column retry. */
  readonly missingColumnFailure: boolean;
  /** Non-lazy primary columns in supported query preparations, including learning and retry attempts. */
  readonly columnsBefore: number;
  /** Columns removed from those projections, not bytes or net savings after retries. */
  readonly columnsOmitted: number;
}

/**
 * Thrown when code reads a field whose column was pruned from the SELECT by a narrowed profile.
 *
 * `ExactColumnsPlugin.track` catches this, widens the endpoint's profile, and re-invokes the
 * endpoint once with full rows; an escaped instance (i.e. outside any `track` scope) is a loud
 * failure by design, because it prevented a silently-wrong `undefined` read.
 */
export class MissingColumnError extends Error {
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
 * Wrap each endpoint in `plugin.track(key, fn)`. Each key starts with full rows and narrows after
 * three invocations add no fields to its learned union. A missing-column error widens the union,
 * retries with full rows, and resumes learning; repeated errors require more stable observations.
 * This follows JIT-style optimize/deopt behavior: common paths optimize quickly, while variable
 * paths back off automatically without requiring callers to describe inputs or branches.
 * I.e. three stable `firstName` reads narrow to that field; a later `lastName` read retries fully,
 * adds `lastName`, and requires five stable observations before narrowing again.
 *
 * A missing-column error after a committed flush propagates because re-running `fn` would repeat
 * its writes. During a flush, the error aborts that transaction, so the full-row retry remains safe.
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
 * Requirements: each `track(fn)` invocation must create its own EntityManager (the missing-column retry
 * re-invokes `fn`, and an EM whose flush aborted is not reusable), and an EM must not span two
 * track scopes. Entity reads must happen inside the tracked callback. Profiles are in-memory only,
 * so each process restart re-learns.
 */
export class ExactColumnsPlugin extends Plugin {
  readonly #onMissingColumn: ((err: MissingColumnError) => void) | undefined;
  readonly #onTrack: ExactColumnsPluginOpts["onTrack"];
  readonly #profiles: Map<string, EndpointProfile> = new Map();

  constructor(opts: ExactColumnsPluginOpts = {}) {
    super();
    this.#onMissingColumn = opts.onMissingColumn;
    this.#onTrack = opts.onTrack;
  }

  /**
   * Runs one endpoint invocation in the key's current learning or narrowed mode.
   *
   * Successful learning calls advance stability only when the learned field union does not grow.
   * A missing-column error deoptimizes before retrying, so its full-row retry starts the next learning epoch.
   * I.e. changing input values does not matter unless they cause code to read a new entity field.
   */
  async track<T>(key: string, fn: () => Promise<T>): Promise<T> {
    let profile = this.#profiles.get(key);
    if (!profile) {
      // A key starts conservatively with full rows and no evidence that its field union is complete.
      profile = {
        key,
        mode: "learning",
        stableRuns: 0,
        instability: 0,
        cleanRuns: 0,
        perMeta: new Map(),
      };
      this.#profiles.set(key, profile);
    }
    // Snapshot the mode for this invocation; a concurrent call may change the profile's next mode.
    // I.e. a call that started learning remains full-row even if another call settles the profile.
    const scope: TrackScope = {
      profile,
      mode: profile.mode,
      flushed: false,
      discoveredNewField: false,
      columns: this.#onTrack ? { before: 0, omitted: 0 } : undefined,
    };
    let retried = false;
    let missingColumnFailure = false;
    try {
      const result = await scopes.run(scope, fn);
      completeInvocation(scope);
      return result;
    } catch (err) {
      if (!(err instanceof MissingColumnError)) throw err;
      // Record before deciding whether retry is safe, so even a post-flush failure fixes the next call.
      // I.e. a missed `age` column is retained even when the current write cannot be replayed.
      recordField(profile, getMetadata(err.entity).cstr, err.fieldName);
      deoptimize(profile);
      this.#onMissingColumn?.(err);
      // Once a flush has written, re-running `fn` would re-execute the committed mutations
      // (i.e. double-writing), so fail this invocation loudly instead of silently retrying
      if (scope.flushed) {
        missingColumnFailure = true;
        throw err;
      }
      // Otherwise re-invoke once with full rows so the read hook records every other field
      // the novel codepath reads; a second missing-column error (i.e. a bug) propagates.
      retried = true;
      // Force this retry to learn even if a concurrent invocation has already narrowed the profile.
      const retryScope: TrackScope = {
        profile,
        mode: "learning",
        flushed: false,
        discoveredNewField: false,
        columns: scope.columns,
      };
      const result = await scopes.run(retryScope, fn);
      completeInvocation(retryScope);
      return result;
    } finally {
      try {
        this.#onTrack?.({
          endpointKey: key,
          optimized: scope.columns!.omitted > 0,
          retried,
          missingColumnFailure,
          columnsBefore: scope.columns!.before,
          columnsOmitted: scope.columns!.omitted,
        });
      } catch {
        // Telemetry must not replace the endpoint's result or error.
      }
    }
  }

  /**
   * Records field reads and fails before an unfetched SQL column can look like a null value.
   *
   * New entities and cached values do not read from the row. I.e. repeated `Author.firstName`
   * reads are one discovery, while the first `Author.lastName` read resets learning stability.
   */
  beforeGetField(entity: Entity, fieldName: string): void {
    if (entity.isNewEntity) return;
    const { data, rowData, rowIndex } = getInstanceData(entity);
    if (fieldName in data) return;
    const scope = scopes.getStore();
    const field = getMetadata(entity).allFields[fieldName];
    // Fields without a serde have no column to profile; let getField fail on them as usual
    if (!field?.serde) return;
    if (scope && recordField(scope.profile, getMetadata(entity).cstr, fieldName)) {
      scope.discoveredNewField = true;
      // Reset immediately so a partially failed call cannot retain evidence from the old union.
      // I.e. discovering `lastName` and then throwing still requires three new stable observations.
      if (scope.mode === "learning") scope.profile.stableRuns = 0;
    }
    // The guard runs even without a scope, i.e. so escaped/forked partial entities fail loudly
    // instead of caching an `undefined` that is indistinguishable from SQL NULL
    for (const column of field.serde.columns) {
      if (!rowData.has(rowIndex, column.columnName)) {
        throw new MissingColumnError(entity, fieldName, scope?.profile.key);
      }
    }
  }

  /**
   * Rewrites the primary table's `alias.*` to the profile's learned columns when it is safe.
   *
   * I.e. an `Author -> { firstName }` profile selects the id, first_name, and timestamps while
   * pruning last_name and other unused columns; unsupported operations retain their original SQL.
   */
  beforeFind(meta: EntityMetadata, operation: FindOperation, query: ParsedFindQuery): void {
    const scope = scopes.getStore();
    if (!scope || (scope.mode !== "narrow" && !scope.columns)) return;
    // STI/CTI hydration probes discriminator/subtype columns outside of getField, so never narrow them
    if (meta.inheritanceType !== undefined) return;
    if (!narrowableOperations.has(operation)) return;
    // Batched queries may contain several tables; only rewrite this metadata's primary table.
    const primary = query.tables.find((t) => t.join === "primary");
    if (!primary || primary.table !== meta.tableName) return;
    const { alias } = primary;
    // Loaders emit either `"a".*` (batch loaders) or `a.*` (parseFindQuery's `kq`), so match both
    const starIndex = query.selects.findIndex((s) => s === `"${alias}".*` || s === `${kq(alias)}.*`);
    if (scope.columns) {
      scope.columns.before += countSelectedColumns(meta, query, alias, starIndex !== -1);
    }
    if (scope.mode !== "narrow") return;
    // Only narrow metas we saw reads for; a type first touched post-learning keeps full rows
    // (and gets recorded by the read hook), so the next invocation narrows it without a missing-column error
    const metaProfile = scope.profile.perMeta.get(meta.cstr);
    if (!metaProfile) return;
    const narrowed = getNarrowedColumns(meta, metaProfile);
    // No rewrite is useful when the profile needs every column.
    if (!narrowed) return;
    if (starIndex !== -1) {
      query.selects.splice(starIndex, 1, ...narrowed.kept.map((c) => kqDot(alias, c)));
      if (scope.columns) scope.columns.omitted += narrowed.pruned.length;
    } else if (meta.hasLazyColumns) {
      // Lazy-column entities already enumerate columns explicitly, so drop the pruned entries
      const pruned = new Set(narrowed.pruned.map((c) => kqDot(alias, c)));
      const before = query.selects.length;
      query.selects = query.selects.filter((s) => typeof s !== "string" || !pruned.has(s));
      if (scope.columns) scope.columns.omitted += before - query.selects.length;
    }
  }

  /**
   * Marks the invocation as having committed writes so a later missing-column error cannot replay them.
   * I.e. reading a missed field after `em.flush()` fails this call but still widens the next call.
   */
  afterWrite(): void {
    const scope = scopes.getStore();
    if (scope) scope.flushed = true;
  }

  /** Forked EMs keep the same plugin instance, i.e. so their partial entities stay guarded. */
  maybeCloneForNewEm(): this {
    return this;
  }
}

interface EndpointProfile {
  key: string;
  /** The mode new invocations snapshot when they start. */
  mode: ExactColumnsProfileMode;
  /** Consecutive successful learning calls that added no fields. */
  stableRuns: number;
  /** Recent missing-column errors; each level selects a larger settling target. */
  instability: number;
  /** Successful narrowed calls toward forgetting one instability level. */
  cleanRuns: number;
  /** The learned field union for each entity type used by this key. */
  perMeta: Map<MaybeAbstractEntityConstructor<any>, MetaProfile>;
}

interface MetaProfile {
  /** Field names read for this entity type across every invocation of the key. */
  fields: Set<string>;
  /** The cached narrow set, rebuilt whenever `fields` has grown since `builtAt`. */
  narrowed?: { builtAt: number; columns: NarrowedColumns | undefined };
}

interface TrackScope {
  profile: EndpointProfile;
  /** The profile mode captured when this invocation started. */
  mode: ExactColumnsProfileMode;
  /** Whether this invocation has flushed writes, i.e. after which a missing-column error must not auto-retry. */
  flushed: boolean;
  /** Whether this invocation added a field to the profile's learned union. */
  discoveredNewField: boolean;
  /** Shared by both attempts; absent when no outcome callback was configured. */
  columns: { before: number; omitted: number } | undefined;
}

interface NarrowedColumns {
  kept: string[];
  pruned: string[];
}

/** Carries each key's mode and evidence through async loads without adding scope arguments to Joist APIs. */
const scopes = new AsyncLocalStorage<TrackScope>();

/**
 * No-growth observations required after successive missing-column errors.
 * I.e. a new key settles after 3 stable calls, while two recent faults raise that target to 8.
 */
const stableRunsByInstability = [3, 5, 8, 13, 21, 34] as const;

/**
 * Clean narrowed invocations required to forget one level of prior instability.
 * I.e. 100 successful narrowed calls reduce an 8-run target back to the 5-run target.
 */
const cleanRunsToDecayInstability = 100;

/**
 * Operations whose primary-row SELECTs are safe to rewrite.
 * I.e. refresh and recursive loaders keep full rows because their hydration logic expects them.
 */
const narrowableOperations: ReadonlySet<FindOperation> = new Set([
  loadOperation,
  findOperation,
  oneToManyLoadOperation,
  oneToManyFindOperation,
  oneToOneLoadOperation,
]);

/** Counts mapped non-lazy primary columns per preparation, not per executed SQL query or returned row. */
function countSelectedColumns(meta: EntityMetadata, query: ParsedFindQuery, alias: string, star: boolean): number {
  let count = 0;
  for (const field of Object.values(meta.fields)) {
    if (!field.serde || (field.kind === "primitive" && field.lazy)) continue;
    for (const column of field.serde.columns) {
      if (star || query.selects.includes(kqDot(alias, column.columnName))) count++;
    }
  }
  return count;
}

/**
 * Advances the profile after a successful learning or narrowed invocation.
 *
 * Learning counts only calls that add no fields; narrowed calls instead prove that prior faults
 * were transient and eventually reduce backoff. I.e. three stable learning calls enable narrowing,
 * while 100 clean narrowed calls change instability 2 to 1.
 */
function completeInvocation(scope: TrackScope): void {
  const { profile } = scope;
  if (scope.mode === "narrow") {
    profile.cleanRuns++;
    // Sustained clean use suggests prior variation was transient, so future faults can settle faster again.
    if (profile.instability > 0 && profile.cleanRuns >= cleanRunsToDecayInstability) {
      profile.instability--;
      // Start a fresh clean window before another level can decay.
      profile.cleanRuns = 0;
    }
  } else if (!scope.discoveredNewField) {
    // A full-row invocation with no new fields is evidence that the learned union has stabilized.
    profile.stableRuns++;
    if (profile.stableRuns >= requiredStableRuns(profile)) {
      // This full-row call supplied the final evidence; the next invocation can narrow.
      profile.mode = "narrow";
      profile.cleanRuns = 0;
    }
  }
}

/**
 * Returns a profile to full-row learning and increases its settling backoff.
 * I.e. the first missing-column error changes the next learning target from 3 stable calls to 5.
 */
function deoptimize(profile: EndpointProfile): void {
  profile.mode = "learning";
  profile.stableRuns = 0;
  profile.cleanRuns = 0;
  profile.instability++;
}

/**
 * Returns the profile's current settling target, capped for persistently variable keys.
 * I.e. instability 2 requires 8 stable calls, while instability 20 remains capped at 34.
 */
function requiredStableRuns(profile: EndpointProfile): number {
  return stableRunsByInstability[Math.min(profile.instability, stableRunsByInstability.length - 1)];
}

/**
 * Adds a field to its entity type's union and reports whether this is its first observation.
 * I.e. `Author.firstName` and `Book.title` grow separate sets, while another firstName read is stable.
 */
function recordField(profile: EndpointProfile, cstr: MaybeAbstractEntityConstructor<any>, fieldName: string): boolean {
  let metaProfile = profile.perMeta.get(cstr);
  if (!metaProfile) {
    metaProfile = { fields: new Set() };
    profile.perMeta.set(cstr, metaProfile);
  }
  // Set.add does not report insertion, so compare sizes to distinguish discovery from a repeated read.
  const size = metaProfile.fields.size;
  metaProfile.fields.add(fieldName);
  return metaProfile.fields.size !== size;
}

/**
 * Splits `meta`'s columns into kept vs pruned for a profile, or undefined if nothing prunes.
 *
 * Every unused column prunes — primitives, enums, and m2o/poly FKs alike (relation loaders read
 * FKs through `getField`, so used FKs are recorded like any other field) — except the pk and the
 * created/updated/deleted timestamp columns (i.e. oplock + soft-delete machinery reads those on
 * every write), and `lazy` columns stay excluded exactly as they are today.
 * I.e. `Author -> { firstName }` keeps id, first_name, and timestamps while pruning last_name.
 */
function getNarrowedColumns(meta: EntityMetadata, metaProfile: MetaProfile): NarrowedColumns | undefined {
  // The field union only grows, so its size is an exact and allocation-free cache version.
  if (metaProfile.narrowed && metaProfile.narrowed.builtAt === metaProfile.fields.size) {
    return metaProfile.narrowed.columns;
  }
  const { timestampFields: ts } = meta;
  const kept: string[] = [];
  const pruned: string[] = [];
  for (const field of Object.values(meta.fields)) {
    if (!field.serde) continue;
    // Lazy fields already have their own on-demand SELECT and must stay out of the base row.
    if (field.kind === "primitive" && field.lazy) continue;
    const isTimestamp =
      field.fieldName === ts?.createdAt || field.fieldName === ts?.updatedAt || field.fieldName === ts?.deletedAt;
    const keep = field.kind === "primaryKey" || isTimestamp || metaProfile.fields.has(field.fieldName);
    // One logical field can map to multiple SQL columns, so keep or prune its serde columns together.
    for (const column of field.serde.columns) {
      (keep ? kept : pruned).push(column.columnName);
    }
  }
  // Undefined means every selectable column is required, so beforeFind should leave the query unchanged.
  const columns = pruned.length > 0 ? { kept, pruned } : undefined;
  metaProfile.narrowed = { builtAt: metaProfile.fields.size, columns };
  return columns;
}

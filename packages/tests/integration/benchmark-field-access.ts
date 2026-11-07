import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

import { Plugin, setDefaultEntityLimit, toJSON } from "joist-orm";

import { installFieldAccessBaseline } from "./benchmark-field-access-baseline";
import {
  initializeDirectDataPrototype,
  initializeFirstReadPrototype,
  initializeInlineSlotsPrototype,
  initializeWarmGetterFloor,
  installDirectDataPrototype,
  installFirstReadPrototype,
  installInlineSlotsPrototype,
  installSelfReplacingPrototype,
  installWarmGetterFloor,
} from "./benchmark-field-access-prototype";
import { Author, FavoriteShape } from "./src/entities";
import { newEntityManager, numberOfQueries, testDriver } from "./src/testEm";

type Mode =
  | "baseline"
  | "joist"
  | "first-read-prototype"
  | "self-replacing-prototype"
  | "inline-slots-prototype"
  | "direct-data-prototype"
  | "warm-getter-floor"
  | "pojo";
type Workload = "primitives" | "ids" | "mixed" | "protected";
type View = Pick<
  Author,
  | "firstName"
  | "lastName"
  | "age"
  | "isFunny"
  | "isPopular"
  | "favoriteShape"
  | "id"
  | "idMaybe"
  | "idTagged"
  | "idTaggedMaybe"
>;

interface Result {
  mode: Mode;
  workload: Workload;
  size: number;
  passes: number;
  samples: number;
  setupMs: number;
  firstPassMs: number;
  meanMs: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
  rsdPct: number;
  cpuMeanMs: number;
  checksum: number;
  firstPassHooks: number;
  measuredHooks: number;
  retainedHeapMb: number;
}

const modes: Mode[] = [
  "baseline",
  "joist",
  "first-read-prototype",
  "self-replacing-prototype",
  "inline-slots-prototype",
  "direct-data-prototype",
  "warm-getter-floor",
  "pojo",
];
const workloads: Workload[] = ["primitives", "ids", "mixed", "protected"];
const readers: Record<Workload, (records: readonly View[], passes: number) => number> = {
  primitives: readPrimitives,
  ids: readIds,
  mixed: readMixed,
  protected: readProtected,
};
const jsonFields = [
  "firstName",
  "lastName",
  "age",
  "isFunny",
  "isPopular",
  "favoriteShape",
  "id",
  "idMaybe",
  "idTagged",
  "idTaggedMaybe",
] as const;
let blackhole = 0;
// Keep both sources and snapshots reachable so retained-heap comparisons do not depend on V8 local liveness.
let heldContext: { authors: readonly Author[]; records: readonly View[] } | undefined;

/**
 * Compares repeated primitive/ID reads on real Authors, first-read getters, and toJSON POJOs.
 *
 * Run after `yarn exec tsdown`:
 * yarn workspace joist-tests-integration benchmark-field-access
 * Defaults: BENCH_SIZES=10000,100000 BENCH_PASSES=100 BENCH_SAMPLES=9 BENCH_WARMUPS=4.
 * BENCH_WORKLOADS selects primitives,ids,mixed,protected (protected is opt-in).
 * BENCH_READ_PLUGIN=1 installs a counting plugin before hydration in every case.
 * BENCH_MODES can add self-replacing-prototype, inline-slots-prototype, direct-data-prototype,
 * and warm-getter-floor to compare layout experiments without changing the production ORM.
 * BENCH_MODES=joist measures just the current implementation for before/after comparisons.
 * BENCH_MIXED_READ_ORDER=1 primes fields in varying orders before timing to stress object layouts.
 * No database connection is needed: hydration uses fixture-schema rows in memory.
 * Each case gets a separate process so its hot loop only sees one representation.
 */
async function main(): Promise<void> {
  if (process.env.BENCH_FIELD_CHILD) {
    try {
      console.log(JSON.stringify(await measure()));
    } finally {
      await testDriver.destroy();
    }
    return;
  }

  const sizes = (process.env.BENCH_SIZES ?? "10000,100000").split(",").map((size) => positiveInteger(size));
  const selectedWorkloads = (process.env.BENCH_WORKLOADS ?? "primitives,ids,mixed").split(",");
  const selectedModes = (process.env.BENCH_MODES ?? "baseline,joist,pojo").split(",") as Mode[];
  for (const mode of selectedModes) assert(modes.includes(mode), mode);
  for (const workload of selectedWorkloads)
    assert(
      workloads.some((allowed) => allowed === workload),
      workload,
    );
  console.log(
    `# node=${process.version} gc=${typeof global.gc === "function"} read_plugin=${process.env.BENCH_READ_PLUGIN ?? "0"} mixed_order=${process.env.BENCH_MIXED_READ_ORDER ?? "0"}`,
  );
  console.log(
    "# baseline=frozen pre-first-read getters; joist=current production implementation; POJOs=real toJSON output",
  );
  console.log("# setup includes hydration/serialization; first_pass includes JIT startup, not steady-state timing");
  console.log("# mixed_order=1 primes fields before timing; the default first_pass uses cold fields");
  console.log("# warm-getter-floor moves all cold work into setup; retained heap includes source entities for POJOs");
  console.log(
    "mode,workload,size,passes,samples,setup_ms,first_pass_ms,median_ms,mean_ms,min_ms,max_ms,rsd_pct,cpu_mean_ms,ns_per_entity,baseline_speedup,pojo_ratio,retained_heap_mb,first_pass_hooks,measured_hooks,checksum",
  );

  try {
    for (const size of sizes) {
      for (const workload of selectedWorkloads) {
        const results = selectedModes.map((mode) => runChild(mode, workload, size));
        const baseline = results.find((result) => result.mode === "baseline");
        const pojo = results.find((result) => result.mode === "pojo");
        for (const result of results) {
          assert.equal(result.checksum, results[0].checksum, "Representations must perform equivalent work");
          console.log(
            [
              result.mode,
              result.workload,
              size,
              result.passes,
              result.samples,
              result.setupMs,
              result.firstPassMs,
              result.medianMs,
              result.meanMs,
              result.minMs,
              result.maxMs,
              result.rsdPct,
              result.cpuMeanMs,
              (result.medianMs * 1e6) / (size * result.passes),
              baseline ? baseline.medianMs / result.medianMs : undefined,
              pojo ? result.medianMs / pojo.medianMs : undefined,
              result.retainedHeapMb,
              result.firstPassHooks,
              result.measuredHooks,
              result.checksum,
            ]
              .map((value) => (typeof value === "number" ? Number(value.toFixed(3)) : value))
              .join(","),
          );
        }
      }
    }
  } finally {
    await testDriver.destroy();
  }
}

/** Launches an isolated V8 instance while retaining the caller's tsx loader and GC flags. */
function runChild(mode: Mode, workload: string, size: number): Result {
  const child = spawnSync(process.execPath, [...process.execArgv, process.argv[1]], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PLUGINS: "",
      BENCH_FIELD_CHILD: mode,
      BENCH_FIELD_WORKLOAD: workload,
      BENCH_FIELD_SIZE: String(size),
    },
    encoding: "utf8",
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`${mode}/${workload}: ${child.stderr || child.stdout}`);
  return JSON.parse(child.stdout) as Result;
}

/**
 * Measures the same checksum loop after materialization and JIT warmup, with no I/O in the timed region.
 *
 * Setup, a single cold sweep, and repeated warm sweeps have separate timings. Each warm
 * sample checks its checksum; installed counters also verify the first-read hook contract.
 */
async function measure(): Promise<Result> {
  const mode = process.env.BENCH_FIELD_CHILD as Mode;
  const workload = process.env.BENCH_FIELD_WORKLOAD as Workload;
  const size = positiveInteger(process.env.BENCH_FIELD_SIZE!);
  const passes = positiveInteger(process.env.BENCH_PASSES ?? "100");
  const samples = positiveInteger(process.env.BENCH_SAMPLES ?? "9");
  const warmups = positiveInteger(process.env.BENCH_WARMUPS ?? "4");
  const read = readers[workload];
  setDefaultEntityLimit(size + 1_000);
  if (mode === "baseline") installFieldAccessBaseline();
  if (mode === "first-read-prototype") installFirstReadPrototype();
  if (mode === "self-replacing-prototype") installSelfReplacingPrototype();
  if (mode === "inline-slots-prototype") installInlineSlotsPrototype();
  if (mode === "direct-data-prototype") installDirectDataPrototype();
  if (mode === "warm-getter-floor") installWarmGetterFloor();

  // Plugins are installed before hydration; the counter exposes the actual hot-path hook traffic.
  global.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const setupStart = performance.now();
  const em = newEntityManager();
  const plugin = new CountReads();
  if (process.env.BENCH_READ_PLUGIN === "1") em.addPlugin(plugin);
  const authors = em.hydrate(Author, makeRows(size));
  if (mode === "first-read-prototype") initializeFirstReadPrototype(authors);
  if (mode === "inline-slots-prototype") initializeInlineSlotsPrototype(authors);
  if (mode === "direct-data-prototype") initializeDirectDataPrototype(authors);
  if (mode === "warm-getter-floor") initializeWarmGetterFloor(authors);
  const mixedOrder = process.env.BENCH_MIXED_READ_ORDER === "1";
  if (mixedOrder) primeDifferentOrders(authors);
  const records: readonly View[] = mode === "pojo" ? await toJSON(authors, jsonFields) : authors;
  heldContext = { authors, records };
  const setupMs = performance.now() - setupStart;

  // A cold sweep is reported separately so initialization is not hidden inside steady-state numbers.
  plugin.calls = 0;
  const firstStart = performance.now();
  const firstChecksum = read(records, 1);
  const firstPassMs = performance.now() - firstStart;
  const firstPassHooks = plugin.calls;
  const fieldsPerEntity = { primitives: 5, ids: 4, mixed: 9, protected: 1 }[workload];
  const firstReadsPerEntity = { primitives: 5, ids: 1, mixed: 6, protected: 1 }[workload];
  const observedFields =
    mode === "baseline"
      ? fieldsPerEntity
      : mode === "pojo" || mode === "warm-getter-floor" || mixedOrder
        ? 0
        : firstReadsPerEntity;
  assert.equal(firstPassHooks, process.env.BENCH_READ_PLUGIN === "1" ? size * observedFields : 0);
  for (let i = 0; i < warmups; i++) blackhole += read(records, passes);
  global.gc?.();
  const retainedHeapMb = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;

  const wall: number[] = [];
  const cpu: number[] = [];
  plugin.calls = 0;
  for (let i = 0; i < samples; i++) {
    global.gc?.();
    const cpuStart = process.cpuUsage();
    const start = performance.now();
    const checksum = read(records, passes);
    wall.push(performance.now() - start);
    const usage = process.cpuUsage(cpuStart);
    cpu.push((usage.user + usage.system) / 1_000);
    assert.equal(checksum, firstChecksum * passes);
    blackhole += checksum;
  }
  const expectedHooks =
    mode === "baseline" && process.env.BENCH_READ_PLUGIN === "1" ? size * passes * samples * fieldsPerEntity : 0;
  assert.equal(plugin.calls, expectedHooks, "Warm reads must follow their representation's hook contract");
  const measuredHooks = plugin.calls;
  assert.equal(numberOfQueries, 0, "The benchmark must not execute SQL");
  assert(Number.isFinite(blackhole));

  // Check that the prototype reads mutable storage rather than freezing a first-read snapshot.
  if (mode !== "baseline" && mode !== "pojo") {
    const author = authors[0];
    const original = author.firstName;
    author.firstName = "changed-after-warmup";
    assert.equal(author.firstName, "changed-after-warmup");
    author.firstName = original;
    em.hydrate(Author, [{ ...makeRows(1)[0], first_name: "refreshed-after-warmup" }], { overwriteExisting: true });
    assert.equal(author.firstName, "refreshed-after-warmup");
  }

  wall.sort((a, b) => a - b);
  const meanMs = mean(wall);
  assert.equal(heldContext.authors.length, size);
  heldContext = undefined;
  return {
    mode,
    workload,
    size,
    passes,
    samples,
    setupMs,
    firstPassMs,
    meanMs,
    medianMs: wall[Math.floor(wall.length / 2)],
    minMs: wall[0],
    maxMs: wall[wall.length - 1],
    rsdPct: (Math.sqrt(mean(wall.map((value) => (value - meanMs) ** 2))) / meanMs) * 100,
    cpuMeanMs: mean(cpu),
    checksum: firstChecksum * passes,
    firstPassHooks,
    measuredHooks,
    retainedHeapMb,
  };
}

/** Traverses every record on each pass, reading strings, optional values, numbers, and booleans. */
function readPrimitives(records: readonly View[], passes: number): number {
  let checksum = 0;
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      checksum +=
        record.firstName.length +
        (record.lastName?.length ?? 0) +
        (record.age ?? 0) * 3 +
        (record.isFunny ? 7 : 0) +
        (record.isPopular ? 11 : 0);
    }
  }
  return checksum;
}

/** Reads all four public ID forms rather than timing an internal storage accessor. */
function readIds(records: readonly View[], passes: number): number {
  let checksum = 0;
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      checksum +=
        record.id.length + (record.idMaybe?.length ?? 0) + record.idTagged.length + (record.idTaggedMaybe?.length ?? 0);
    }
  }
  return checksum;
}

/** Combines primitive calculations and ID reads in one realistic entity traversal. */
function readMixed(records: readonly View[], passes: number): number {
  let checksum = 0;
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      checksum +=
        record.firstName.length +
        (record.lastName?.length ?? 0) +
        (record.age ?? 0) * 3 +
        (record.isFunny ? 7 : 0) +
        (record.isPopular ? 11 : 0) +
        record.id.length +
        (record.idMaybe?.length ?? 0) +
        record.idTagged.length +
        (record.idTaggedMaybe?.length ?? 0);
    }
  }
  return checksum;
}

/** Separately measures the real fixture's protected enum, avoiding inflated unprotected-field results. */
function readProtected(records: readonly View[], passes: number): number {
  let checksum = 0;
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < records.length; i++) {
      checksum += records[i].favoriteShape?.length ?? 0;
    }
  }
  return checksum;
}

/** Primes the same fields in seven orders, exposing own-property layout sensitivity outside the timer. */
function primeDifferentOrders(authors: readonly Author[]): void {
  const fields = ["firstName", "lastName", "age", "isFunny", "isPopular", "favoriteShape", "idTaggedMaybe"] as const;
  for (let i = 0; i < authors.length; i++) {
    for (let offset = 0; offset < fields.length; offset++) {
      void authors[i][fields[(i + offset) % fields.length]];
    }
  }
}

/** Counts without allocating a per-read log or recursively accessing an entity. */
class CountReads extends Plugin {
  calls = 0;

  override beforeGetField(): void {
    this.calls++;
  }
}

/** Uses existing schema columns, with nulls, false, and zero mixed into otherwise stable row shapes. */
function makeRows(size: number): Record<string, unknown>[] {
  return Array.from({ length: size }, (_, i) => ({
    id: i + 1,
    first_name: `first${i}`,
    last_name: i % 4 === 0 ? null : `last${i}`,
    age: i % 5 === 0 ? null : i % 90,
    is_funny: i % 3 === 0,
    is_popular: i % 2 === 0,
    favorite_shape: i % 2 === 0 ? FavoriteShape.Circle : FavoriteShape.Square,
    created_at: new Date("2020-01-01T00:00:00.000Z"),
    updated_at: new Date("2020-01-02T00:00:00.000Z"),
  }));
}

/** Rejects accidental zero/NaN configurations instead of reporting meaningless timings. */
function positiveInteger(value: string): number {
  const parsed = Number(value);
  assert(Number.isSafeInteger(parsed) && parsed > 0, `Expected a positive integer, got ${value}`);
  return parsed;
}

/** Returns the arithmetic mean of nonempty samples. */
function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

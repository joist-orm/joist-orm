import { setDefaultEntityLimit, type Entity } from "joist-orm";
import { performance, PerformanceObserver } from "node:perf_hooks";
import { Author, type EntityManager } from "./src/entities";
import { newEntityManager, testDriver } from "./src/testEm";

type Row = Record<string, unknown>;

interface ScenarioResult {
  checksum: number;
  em: EntityManager;
  entities: Entity[];
}

interface Scenario {
  name: string;
  run(rows: readonly Row[]): ScenarioResult;
}

interface Sample {
  cpuMs: number;
  gcCount: number;
  gcPauseMs: number;
  wallMs: number;
}

interface BenchmarkConfig {
  iterations: number;
  size: number;
  warmups: number;
}

let blackhole = 0;
let heldResult: ScenarioResult | undefined;
let gcCount = 0;
let gcPauseMs = 0;
const graduated = new Date("2020-01-01T00:00:00.000Z");
const createdAt = new Date("2020-01-01T00:00:00.000Z");
const updatedAt = new Date("2020-01-02T00:00:00.000Z");

/**
 * Benchmarks EntityManager viability at ~1M entities.
 *
 * Reports wall/cpu time plus GC pause totals during each run and the retained
 * heap per entity after a forced GC, i.e. the long-term cost of holding a huge
 * identity map. Run with NODE_OPTIONS="--expose-gc --max-old-space-size=8192".
 */
async function main(): Promise<void> {
  const sizes = readSizes();
  setDefaultEntityLimit(Math.max(...sizes) + 1_000);
  observeGc();
  console.log(`node=${process.version} exposeGc=${typeof global.gc === "function"}`);
  console.log(
    "scenario,size,iterations,mean_ms,min_ms,max_ms,rsd,cpu_mean_ms,gc_count,gc_pause_ms,retained_mb,retained_bytes_per_entity",
  );

  for (const size of sizes) {
    const rows = makeAuthorRows(size);
    const config = configForSize(size);
    await runScenario(hydrate(), rows, config);
    await runScenario(hydrateWithScalarReads(), rows, config);
    await runScenario(hydrateThenMutate(), rows, config);
  }

  // Prevent overly-aggressive dead-code elimination in alternate JS runtimes.
  if (blackhole === Number.MIN_SAFE_INTEGER) console.log(blackhole);
  await testDriver.destroy();
}

/** Returns the sizes to benchmark, allowing BENCH_SIZES=250000,1000000 overrides. */
function readSizes(): number[] {
  const input = process.env.BENCH_SIZES;
  if (!input) return [1_000_000];
  return input.split(",").map((value) => Number(value.trim()));
}

/** Returns iteration counts that keep 1M-entity runs practical. */
function configForSize(size: number): BenchmarkConfig {
  if (size >= 500_000) return { iterations: 4, size, warmups: 1 };
  return { iterations: 6, size, warmups: 2 };
}

/** Measures one scenario after warmup and prints a CSV row with GC and retained-heap stats. */
async function runScenario(scenario: Scenario, rows: readonly Row[], config: BenchmarkConfig): Promise<void> {
  for (let i = 0; i < config.warmups; i++) {
    consume(scenario.run(rows));
    forceGc();
  }

  const samples: Sample[] = [];
  for (let i = 0; i < config.iterations; i++) {
    forceGc();
    await drainGcObserver();
    const gcCountBefore = gcCount;
    const gcPauseBefore = gcPauseMs;
    const cpuBefore = process.cpuUsage();
    const start = performance.now();
    heldResult = scenario.run(rows);
    const wallMs = performance.now() - start;
    const cpu = process.cpuUsage(cpuBefore);
    await drainGcObserver();
    const sampleGcCount = gcCount - gcCountBefore;
    const sampleGcPauseMs = gcPauseMs - gcPauseBefore;
    consume(heldResult);
    heldResult = undefined;
    samples.push({
      cpuMs: (cpu.user + cpu.system) / 1_000,
      gcCount: sampleGcCount,
      gcPauseMs: sampleGcPauseMs,
      wallMs,
    });
    forceGc();
  }

  // Measure retained heap in its own synchronous frame: dead-but-uncleared V8 frame registers
  // in this async fn can pin the previous iteration's result, which corrupts before/after deltas
  // taken here; inside a fresh frame any such pin is constant on both sides of the measurement.
  const retainedMb = measureRetainedMb(scenario, rows);

  const wall = samples.map((sample) => sample.wallMs).sort((a, b) => a - b);
  const meanMs = mean(wall);
  console.log(
    [
      scenario.name,
      config.size,
      config.iterations,
      fmt(meanMs),
      fmt(wall[0]),
      fmt(wall[wall.length - 1]),
      fmt(standardDeviation(wall, meanMs) / meanMs),
      fmt(mean(samples.map((sample) => sample.cpuMs))),
      fmt(mean(samples.map((sample) => sample.gcCount))),
      fmt(mean(samples.map((sample) => sample.gcPauseMs))),
      fmt(retainedMb),
      fmt((retainedMb * 1024 * 1024) / config.size),
    ].join(","),
  );
}

/** Hydrates Authors into a fresh EntityManager without touching scalar fields. */
function hydrate(): Scenario {
  return {
    name: "million_hydrate",
    run(rows: readonly Row[]): ScenarioResult {
      const em = newEntityManager();
      const entities = em.hydrate(Author, rows);
      return { checksum: entities.length, em, entities };
    },
  };
}

/** Hydrates Authors and reads common scalars, forcing lazy serde into InstanceData.data. */
function hydrateWithScalarReads(): Scenario {
  return {
    name: "million_hydrate_scalar_reads",
    run(rows: readonly Row[]): ScenarioResult {
      const em = newEntityManager();
      const entities = em.hydrate(Author, rows);
      let checksum = 0;
      for (const author of entities) {
        checksum += author.firstName.length;
        checksum += author.age ?? 0;
        checksum += author.isFunny ? 1 : 0;
      }
      return { checksum, em, entities };
    },
  };
}

/** Hydrates Authors then mutates one field on every entity, exercising dirty tracking at scale. */
function hydrateThenMutate(): Scenario {
  return {
    name: "million_hydrate_mutate",
    run(rows: readonly Row[]): ScenarioResult {
      const em = newEntityManager();
      const entities = em.hydrate(Author, rows);
      for (const author of entities) author.firstName = `changed${author.age}`;
      return { checksum: entities.length, em, entities };
    },
  };
}

/** Creates Author rows with the same shape as the hydration benchmark. */
function makeAuthorRows(size: number): Row[] {
  const rows = new Array<Row>(size);
  for (let i = 0; i < size; i++) {
    rows[i] = {
      id: i + 1,
      first_name: `first${i}`,
      last_name: `last${i}`,
      ssn: `ssn${i}`,
      initials: "fl",
      number_of_books: i % 17,
      is_popular: i % 2 === 0,
      age: 20 + (i % 60),
      graduated,
      nick_names: [`nick${i}`],
      is_funny: i % 3 === 0,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }
  return rows;
}

/** Runs `scenario` once and returns the post-GC heap growth while holding its result. */
function measureRetainedMb(scenario: Scenario, rows: readonly Row[]): number {
  forceGc();
  const heapBefore = process.memoryUsage().heapUsed;
  let result: ScenarioResult | undefined = scenario.run(rows);
  forceGc();
  const heapAfter = process.memoryUsage().heapUsed;
  consume(result);
  result = undefined;
  forceGc();
  return (heapAfter - heapBefore) / 1024 / 1024;
}

/** Accumulates GC pause counts/durations reported by the performance observer. */
function observeGc(): void {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      gcCount += 1;
      gcPauseMs += entry.duration;
    }
  });
  observer.observe({ entryTypes: ["gc"] });
}

/** Waits for pending GC performance entries to be delivered to the observer. */
async function drainGcObserver(): Promise<void> {
  await new Promise<void>(resolveImmediate);
  await new Promise<void>(resolveImmediate);
}

/** Returns the arithmetic mean. */
function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Returns the population standard deviation. */
function standardDeviation(values: readonly number[], meanValue: number): number {
  const variance = mean(values.map((value) => (value - meanValue) ** 2));
  return Math.sqrt(variance);
}

/** Keeps benchmark results observable until after retained heap is measured. */
function consume(result: ScenarioResult): void {
  blackhole += result.checksum + result.em.numberOfEntities + result.entities.length;
}

/** Runs a full GC when node was started with --expose-gc. */
function forceGc(): void {
  global.gc?.();
}

/** Resolves on the next immediate tick. */
function resolveImmediate(resolve: () => void): void {
  setImmediate(resolve);
}

/** Formats numeric CSV fields. */
function fmt(value: number): string {
  return value.toFixed(3);
}

main().catch(async (error: unknown) => {
  console.error(error);
  await testDriver.destroy();
  process.exitCode = 1;
});

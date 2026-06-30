import { setDefaultEntityLimit, tagId, type Entity } from "joist-orm";
import { performance } from "node:perf_hooks";
import { Author, type EntityManager } from "./src/entities";
import { newEntityManager, testDriver } from "./src/testEm";

type Row = Record<string, unknown>;

interface ScenarioContext {
  em: EntityManager;
  ids: readonly string[];
}

interface ScenarioResult {
  checksum: number;
  em: EntityManager;
  entities: Entity[];
}

interface Scenario {
  name: string;
  setup(size: number): ScenarioContext;
  run(context: ScenarioContext): Promise<ScenarioResult>;
}

interface Sample {
  cpuMs: number;
  heapDeltaMb: number;
  wallMs: number;
}

interface Summary {
  cpuMeanMs: number;
  heapMeanMb: number;
  maxMs: number;
  meanMs: number;
  minMs: number;
  p50Ms: number;
  p90Ms: number;
  p99Ms: number;
  rsd: number;
}

interface BenchmarkConfig {
  iterations: number;
  size: number;
  warmups: number;
}

let blackhole = 0;
let heldResult: ScenarioResult | undefined;
const graduated = new Date("2020-01-01T00:00:00.000Z");
const createdAt = new Date("2020-01-01T00:00:00.000Z");
const updatedAt = new Date("2020-01-02T00:00:00.000Z");

/** Benchmarks identity-map-only EntityManager.loadAll and loadAllIfExists paths. */
async function main(): Promise<void> {
  const sizes = readSizes();
  setDefaultEntityLimit(Math.max(...sizes) + 1_000);
  console.log(`node=${process.version} exposeGc=${typeof global.gc === "function"}`);
  console.log("scenario,size,iterations,mean_ms,p50_ms,p90_ms,p99_ms,min_ms,max_ms,rsd,cpu_mean_ms,heap_delta_mb");

  for (const size of sizes) {
    const config = configForSize(size);
    await runScenario(loadAllUntaggedHits(), config);
    await runScenario(loadAllTaggedHits(), config);
    await runScenario(loadAllIfExistsUntaggedHits(), config);
    await runScenario(loadAllIfExistsTaggedHits(), config);
  }

  // Prevent overly-aggressive dead-code elimination in alternate JS runtimes.
  if (blackhole === Number.MIN_SAFE_INTEGER) console.log(blackhole);
  await testDriver.destroy();
}

/** Returns the sizes to benchmark, allowing BENCH_SIZES=10000,50000 overrides. */
function readSizes(): number[] {
  const input = process.env.BENCH_SIZES;
  if (!input) return [10_000, 50_000, 100_000];
  return input.split(",").map((value) => Number(value.trim()));
}

/** Returns iteration counts that keep 100k-entity runs high signal but practical. */
function configForSize(size: number): BenchmarkConfig {
  if (size >= 100_000) return { iterations: 12, size, warmups: 6 };
  if (size >= 50_000) return { iterations: 18, size, warmups: 8 };
  return { iterations: 40, size, warmups: 12 };
}

/** Measures one scenario after warmup and prints a CSV row. */
async function runScenario(scenario: Scenario, config: BenchmarkConfig): Promise<void> {
  const context = scenario.setup(config.size);
  for (let i = 0; i < config.warmups; i++) {
    consume(await scenario.run(context));
    forceGc();
  }

  const samples: Sample[] = [];
  for (let i = 0; i < config.iterations; i++) {
    forceGc();
    const heapBefore = process.memoryUsage().heapUsed;
    const cpuBefore = process.cpuUsage();
    const start = performance.now();
    heldResult = await scenario.run(context);
    const wallMs = performance.now() - start;
    const cpu = process.cpuUsage(cpuBefore);
    forceGc();
    const heapAfter = process.memoryUsage().heapUsed;
    consume(heldResult);
    heldResult = undefined;
    samples.push({
      cpuMs: (cpu.user + cpu.system) / 1_000,
      heapDeltaMb: (heapAfter - heapBefore) / 1024 / 1024,
      wallMs,
    });
    forceGc();
    await new Promise<void>(resolveImmediate);
  }

  const summary = summarize(samples);
  console.log(
    [
      scenario.name,
      config.size,
      config.iterations,
      fmt(summary.meanMs),
      fmt(summary.p50Ms),
      fmt(summary.p90Ms),
      fmt(summary.p99Ms),
      fmt(summary.minMs),
      fmt(summary.maxMs),
      fmt(summary.rsd),
      fmt(summary.cpuMeanMs),
      fmt(summary.heapMeanMb),
    ].join(","),
  );
}

/** Loads already-hydrated Authors by untagged ids with loadAll. */
function loadAllUntaggedHits(): Scenario {
  return {
    name: "load_all_hits_untagged",
    setup: setupUntagged,
    async run(context: ScenarioContext): Promise<ScenarioResult> {
      const entities = await context.em.loadAll(Author, context.ids);
      return { checksum: checksum(entities), em: context.em, entities };
    },
  };
}

/** Loads already-hydrated Authors by tagged ids with loadAll. */
function loadAllTaggedHits(): Scenario {
  return {
    name: "load_all_hits_tagged",
    setup: setupTagged,
    async run(context: ScenarioContext): Promise<ScenarioResult> {
      const entities = await context.em.loadAll(Author, context.ids);
      return { checksum: checksum(entities), em: context.em, entities };
    },
  };
}

/** Loads already-hydrated Authors by untagged ids with loadAllIfExists. */
function loadAllIfExistsUntaggedHits(): Scenario {
  return {
    name: "load_all_if_exists_hits_untagged",
    setup: setupUntagged,
    async run(context: ScenarioContext): Promise<ScenarioResult> {
      const entities = await context.em.loadAllIfExists(Author, context.ids);
      return { checksum: checksum(entities), em: context.em, entities };
    },
  };
}

/** Loads already-hydrated Authors by tagged ids with loadAllIfExists. */
function loadAllIfExistsTaggedHits(): Scenario {
  return {
    name: "load_all_if_exists_hits_tagged",
    setup: setupTagged,
    async run(context: ScenarioContext): Promise<ScenarioResult> {
      const entities = await context.em.loadAllIfExists(Author, context.ids);
      return { checksum: checksum(entities), em: context.em, entities };
    },
  };
}

/** Creates an EntityManager and untagged ids for the all-hit identity-map benchmark. */
function setupUntagged(size: number): ScenarioContext {
  const em = newEntityManager();
  em.hydrate(Author, makeAuthorRows(size));
  return { em, ids: makeIds(size, false) };
}

/** Creates an EntityManager and tagged ids for the all-hit identity-map benchmark. */
function setupTagged(size: number): ScenarioContext {
  const em = newEntityManager();
  em.hydrate(Author, makeAuthorRows(size));
  return { em, ids: makeIds(size, true) };
}

/** Creates Author rows with only columns needed for registration. */
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

/** Creates ids in sequential order, optionally pre-tagged. */
function makeIds(size: number, tagged: boolean): string[] {
  const ids = new Array<string>(size);
  for (let i = 0; i < size; i++) {
    ids[i] = tagged ? tagId(Author, i + 1) : `${i + 1}`;
  }
  return ids;
}

/** Reads stable ids so the result array remains observable. */
function checksum(entities: readonly Author[]): number {
  let sum = 0;
  for (const entity of entities) {
    sum += entity.id.length;
  }
  return sum;
}

/** Summarizes benchmark samples. */
function summarize(samples: Sample[]): Summary {
  const wall = samples.map((sample) => sample.wallMs).sort((a, b) => a - b);
  const meanMs = mean(wall);
  return {
    cpuMeanMs: mean(samples.map((sample) => sample.cpuMs)),
    heapMeanMb: mean(samples.map((sample) => sample.heapDeltaMb)),
    maxMs: wall[wall.length - 1],
    meanMs,
    minMs: wall[0],
    p50Ms: percentile(wall, 0.5),
    p90Ms: percentile(wall, 0.9),
    p99Ms: percentile(wall, 0.99),
    rsd: standardDeviation(wall, meanMs) / meanMs,
  };
}

/** Returns the arithmetic mean. */
function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Returns the nearest-rank percentile. */
function percentile(sortedValues: readonly number[], p: number): number {
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * p) - 1));
  return sortedValues[index];
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

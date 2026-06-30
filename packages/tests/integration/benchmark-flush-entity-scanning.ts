import { setDefaultEntityLimit, type Entity } from "joist-orm";
import { performance } from "node:perf_hooks";
import { Author, type EntityManager } from "./src/entities";
import { newEntityManager, setApiCallMock, testDriver } from "./src/testEm";

type Row = Record<string, unknown>;

interface ScenarioContext {
  em: EntityManager;
  entities: Author[];
}

interface ScenarioResult {
  checksum: number;
  em: EntityManager;
  entities: Entity[];
}

interface Scenario {
  dirtyCount: number;
  name: string;
  setup(size: number): ScenarioContext;
  skipValidation: boolean;
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

/** Benchmarks EntityManager.flush pending-entity scans over large identity maps. */
async function main(): Promise<void> {
  setApiCallMock(async function makeApiCall(): Promise<void> {});
  const sizes = readSizes();
  setDefaultEntityLimit(Math.max(...sizes) + 1_000);
  console.log(`node=${process.version} exposeGc=${typeof global.gc === "function"}`);
  console.log(
    "scenario,size,dirty_count,iterations,mean_ms,p50_ms,p90_ms,p99_ms,min_ms,max_ms,rsd,cpu_mean_ms,heap_delta_mb",
  );

  for (const size of sizes) {
    const config = configForSize(size);
    await runScenario(flushScenario(0, false), config);
    await runScenario(flushScenario(0, true), config);
    await runScenario(flushScenario(1, false), config);
    await runScenario(flushScenario(1, true), config);
    await runScenario(flushScenario(100, false), config);
    await runScenario(flushScenario(100, true), config);
    await runScenario(flushScenario(Math.min(10_000, size), false), config);
    await runScenario(flushScenario(Math.min(10_000, size), true), config);
  }

  // Prevent overly-aggressive dead-code elimination in alternate JS runtimes.
  if (blackhole === Number.MIN_SAFE_INTEGER) console.log(blackhole);
  await testDriver.destroy();
}

/** Returns the sizes to benchmark, allowing BENCH_SIZES=10000,50000 overrides. */
function readSizes(): number[] {
  const input = process.env.BENCH_SIZES;
  if (!input) return [10_000, 50_000, 100_000];
  return input.split(",").map(function parseSize(value) {
    return Number(value.trim());
  });
}

/** Returns iteration counts that keep 100k-entity runs high signal but practical. */
function configForSize(size: number): BenchmarkConfig {
  if (size >= 100_000) return { iterations: 10, size, warmups: 4 };
  if (size >= 50_000) return { iterations: 14, size, warmups: 5 };
  return { iterations: 24, size, warmups: 8 };
}

/** Measures one scenario after warmup and prints a CSV row. */
async function runScenario(scenario: Scenario, config: BenchmarkConfig): Promise<void> {
  for (let i = 0; i < config.warmups; i++) {
    consume(await runFlush(scenario.setup(config.size), scenario.skipValidation));
    forceGc();
  }

  const samples: Sample[] = [];
  for (let i = 0; i < config.iterations; i++) {
    const context = scenario.setup(config.size);
    forceGc();
    const heapBefore = process.memoryUsage().heapUsed;
    const cpuBefore = process.cpuUsage();
    const start = performance.now();
    heldResult = await runFlush(context, scenario.skipValidation);
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
      scenario.dirtyCount,
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

/** Creates a flush benchmark scenario with a fixed dirty entity count. */
function flushScenario(dirtyCount: number, skipValidation: boolean): Scenario {
  return {
    dirtyCount,
    name: `flush_dirty_${dirtyCount}_${skipValidation ? "skip_validation" : "validation"}`,
    setup(size: number): ScenarioContext {
      const em = newEntityManager();
      em.driver = noopDriver(em.driver);
      const entities = em.hydrate(Author, makeAuthorRows(size));
      for (let i = 0; i < dirtyCount; i++) {
        entities[i].firstName = `changed${i}`;
      }
      return { em, entities };
    },
    skipValidation,
  };
}

/** Flushes a prepared context and returns observable data. */
async function runFlush(context: ScenarioContext, skipValidation: boolean): Promise<ScenarioResult> {
  const flushed = await context.em.flush({ skipValidation });
  return { checksum: checksum(flushed), em: context.em, entities: flushed };
}

/** Wraps the real driver but disables transaction, id assignment, and DB writes. */
function noopDriver(driver: EntityManager["driver"]): EntityManager["driver"] {
  return {
    defaultPlugins: driver.defaultPlugins,
    assignNewIds: async function assignNewIds(): Promise<void> {},
    executeFind: async function executeFind(): Promise<unknown[]> {
      return [];
    },
    executeQuery: async function executeQuery(): Promise<unknown[]> {
      return [];
    },
    flush: async function flush(): Promise<void> {},
    transaction: async function transaction<T>(_em: EntityManager, fn: () => Promise<T>): Promise<T> {
      return fn();
    },
  };
}

/** Creates Author rows with only columns needed for registration and mutation. */
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

/** Reads stable ids so flushed entities remain observable. */
function checksum(entities: readonly Entity[]): number {
  let sum = 0;
  for (const entity of entities) {
    sum += entity.id.length;
  }
  return sum;
}

/** Summarizes benchmark samples. */
function summarize(samples: Sample[]): Summary {
  const wall = samples
    .map(function readWall(sample) {
      return sample.wallMs;
    })
    .sort(function compareNumbers(a, b) {
      return a - b;
    });
  const meanMs = mean(wall);
  return {
    cpuMeanMs: mean(
      samples.map(function readCpu(sample) {
        return sample.cpuMs;
      }),
    ),
    heapMeanMb: mean(
      samples.map(function readHeap(sample) {
        return sample.heapDeltaMb;
      }),
    ),
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
  return (
    values.reduce(function add(sum, value) {
      return sum + value;
    }, 0) / values.length
  );
}

/** Returns the nearest-rank percentile. */
function percentile(sortedValues: readonly number[], p: number): number {
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * p) - 1));
  return sortedValues[index];
}

/** Returns the population standard deviation. */
function standardDeviation(values: readonly number[], meanValue: number): number {
  const variance = mean(
    values.map(function squareDifference(value) {
      return (value - meanValue) ** 2;
    }),
  );
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

main().catch(async function handleError(error: unknown): Promise<void> {
  console.error(error);
  await testDriver.destroy();
  process.exitCode = 1;
});

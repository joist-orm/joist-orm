import { setDefaultEntityLimit } from "joist-orm";
import { performance } from "node:perf_hooks";
import { Author, type EntityManager } from "./src/entities";
import { newEntityManager, testDriver } from "./src/testEm";

interface ScenarioContext {
  em: EntityManager;
  queryCount: number;
}

interface ScenarioResult {
  checksum: number;
  context: ScenarioContext;
}

interface Scenario {
  name: string;
  queryCount: number;
  run(context: ScenarioContext): Promise<ScenarioResult>;
}

interface Sample {
  cpuUserMs: number;
  cpuSystemMs: number;
  heapDeltaMb: number;
  heapRetainedMb: number;
  wallMs: number;
}

interface Summary {
  cpuSystemMs: number;
  cpuUserMs: number;
  heapDeltaMb: number;
  heapRetainedMb: number;
  meanMs: number;
  p50Ms: number;
  p90Ms: number;
  p99Ms: number;
  rsdPct: number;
}

interface BenchmarkConfig {
  iterations: number;
  queryCount: number;
  warmups: number;
}

type ExecuteFind = EntityManager["driver"]["executeFind"];

let blackhole = 0;
let heldResult: ScenarioResult | undefined;

/** Benchmarks phase 8 find query preparation and batching hot paths. */
async function main(): Promise<void> {
  const originalExecuteFind = testDriver.driver.executeFind.bind(testDriver.driver) as ExecuteFind;
  testDriver.driver.executeFind = async function executeFind(): Promise<unknown[]> {
    return [];
  } as ExecuteFind;

  try {
    const queryCounts = readQueryCounts();
    setDefaultEntityLimit(Math.max(...queryCounts) + 1_000);
    console.log(`node=${process.version} exposeGc=${typeof global.gc === "function"}`);
    console.log(
      "scenario,size,samples,p50_ms,p90_ms,p99_ms,mean_ms,rsd_pct,cpu_user_ms,cpu_system_ms,heap_delta_mb,heap_retained_mb",
    );

    for (const queryCount of queryCounts) {
      const config = configForQueryCount(queryCount);
      await runScenario(identicalStructureOneField(queryCount), config);
      await runScenario(identicalStructureTwoFields(queryCount), config);
      await runScenario(identicalStructureWithHint(queryCount), config);
    }

    if (blackhole === Number.MIN_SAFE_INTEGER) console.log(blackhole);
  } finally {
    testDriver.driver.executeFind = originalExecuteFind;
    await testDriver.destroy();
  }
}

/** Returns the batched query counts to benchmark, allowing BENCH_SIZES=10,100 overrides. */
function readQueryCounts(): number[] {
  const input = process.env.BENCH_SIZES;
  if (!input) return [1, 10, 100, 1_000];
  return input.split(",").map(function parseSize(value) {
    return Number(value.trim());
  });
}

/** Returns iteration counts that keep the 1k-query samples practical. */
function configForQueryCount(queryCount: number): BenchmarkConfig {
  if (queryCount >= 1_000) return { iterations: 18, queryCount, warmups: 8 };
  if (queryCount >= 100) return { iterations: 28, queryCount, warmups: 10 };
  return { iterations: 40, queryCount, warmups: 12 };
}

/** Measures one scenario after warmup and prints a CSV row. */
async function runScenario(scenario: Scenario, config: BenchmarkConfig): Promise<void> {
  for (let i = 0; i < config.warmups; i++) {
    consume(await scenario.run(setupContext(config.queryCount)));
    forceGc();
  }

  const samples: Sample[] = [];
  for (let i = 0; i < config.iterations; i++) {
    const context = setupContext(config.queryCount);
    forceGc();
    const heapBefore = process.memoryUsage().heapUsed;
    const cpuBefore = process.cpuUsage();
    const start = performance.now();
    heldResult = await scenario.run(context);
    const wallMs = performance.now() - start;
    const cpu = process.cpuUsage(cpuBefore);
    const heapAfterRun = process.memoryUsage().heapUsed;
    forceGc();
    const heapAfterGc = process.memoryUsage().heapUsed;
    consume(heldResult);
    heldResult = undefined;
    samples.push({
      cpuSystemMs: cpu.system / 1_000,
      cpuUserMs: cpu.user / 1_000,
      heapDeltaMb: (heapAfterRun - heapBefore) / 1024 / 1024,
      heapRetainedMb: (heapAfterGc - heapBefore) / 1024 / 1024,
      wallMs,
    });
    forceGc();
    await new Promise<void>(resolveImmediate);
  }

  const summary = summarize(samples);
  console.log(
    [
      scenario.name,
      scenario.queryCount,
      config.iterations,
      fmt(summary.p50Ms),
      fmt(summary.p90Ms),
      fmt(summary.p99Ms),
      fmt(summary.meanMs),
      fmt(summary.rsdPct),
      fmt(summary.cpuUserMs),
      fmt(summary.cpuSystemMs),
      fmt(summary.heapDeltaMb),
      fmt(summary.heapRetainedMb),
    ].join(","),
  );
}

/** Measures many same-shape one-field finds batched into one tick. */
function identicalStructureOneField(queryCount: number): Scenario {
  return {
    name: "find_query_prep_one_field",
    queryCount,
    async run(context: ScenarioContext): Promise<ScenarioResult> {
      const results = await Promise.all(
        Array.from({ length: queryCount }, function findByFirstName(_, i) {
          return context.em.find(Author, { firstName: `first${i}` });
        }),
      );
      return { checksum: checksum(results), context };
    },
  };
}

/** Measures many same-shape two-field finds batched into one tick. */
function identicalStructureTwoFields(queryCount: number): Scenario {
  return {
    name: "find_query_prep_two_fields",
    queryCount,
    async run(context: ScenarioContext): Promise<ScenarioResult> {
      const results = await Promise.all(
        Array.from({ length: queryCount }, function findByNameAndAge(_, i) {
          return context.em.find(Author, { firstName: `first${i}`, age: 20 + (i % 60) });
        }),
      );
      return { checksum: checksum(results), context };
    },
  };
}

/** Measures repeated hint serialization and preloading setup costs. */
function identicalStructureWithHint(queryCount: number): Scenario {
  return {
    name: "find_query_prep_with_hint",
    queryCount,
    async run(context: ScenarioContext): Promise<ScenarioResult> {
      const results = await Promise.all(
        Array.from({ length: queryCount }, function findByLastNameWithHint(_, i) {
          return context.em.find(Author, { lastName: i % 2 === 0 ? "even" : "odd" }, { populate: "publisher" });
        }),
      );
      return { checksum: checksum(results), context };
    },
  };
}

/** Creates a fresh EntityManager for one isolated sample. */
function setupContext(queryCount: number): ScenarioContext {
  return { em: newEntityManager(), queryCount };
}

/** Returns a checksum to keep benchmark results observable. */
function checksum(results: readonly Author[][]): number {
  let value = results.length;
  for (const result of results) value += result.length;
  return value;
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
    cpuSystemMs: mean(
      samples.map(function readCpuSystem(sample) {
        return sample.cpuSystemMs;
      }),
    ),
    cpuUserMs: mean(
      samples.map(function readCpuUser(sample) {
        return sample.cpuUserMs;
      }),
    ),
    heapDeltaMb: mean(
      samples.map(function readHeapDelta(sample) {
        return sample.heapDeltaMb;
      }),
    ),
    heapRetainedMb: mean(
      samples.map(function readHeapRetained(sample) {
        return sample.heapRetainedMb;
      }),
    ),
    meanMs,
    p50Ms: percentile(wall, 0.5),
    p90Ms: percentile(wall, 0.9),
    p99Ms: percentile(wall, 0.99),
    rsdPct: (standardDeviation(wall, meanMs) / meanMs) * 100,
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
  blackhole += result.checksum + result.context.queryCount;
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

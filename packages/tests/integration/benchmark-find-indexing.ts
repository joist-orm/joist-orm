import { setDefaultEntityLimit } from "joist-orm";
import { performance } from "node:perf_hooks";
import { Author, SmallPublisher, type EntityManager, type Publisher } from "./src/entities";
import { newEntityManager, testDriver } from "./src/testEm";

type Row = Record<string, unknown>;

interface ScenarioContext {
  em: EntityManager;
  entities: Author[];
  publishers: Publisher[];
}

interface ScenarioResult {
  checksum: number;
  context: ScenarioContext;
}

interface Scenario {
  name: string;
  setup(size: number): ScenarioContext;
  run(context: ScenarioContext): ScenarioResult;
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
  size: number;
  warmups: number;
}

let blackhole = 0;
let heldResult: ScenarioResult | undefined;
const publisherCount = 100;
const lookupIterations = 100;
const graduated = new Date("2020-01-01T00:00:00.000Z");
const createdAt = new Date("2020-01-01T00:00:00.000Z");
const updatedAt = new Date("2020-01-02T00:00:00.000Z");

/** Benchmarks phase 7 in-memory find indexing hot paths. */
async function main(): Promise<void> {
  const sizes = readSizes();
  setDefaultEntityLimit(Math.max(...sizes) + publisherCount + 1_000);
  console.log(`node=${process.version} exposeGc=${typeof global.gc === "function"}`);
  console.log(
    "scenario,size,samples,p50_ms,p90_ms,p99_ms,mean_ms,rsd_pct,cpu_user_ms,cpu_system_ms,heap_delta_mb,heap_retained_mb",
  );

  for (const size of sizes) {
    const config = configForSize(size);
    await runScenario(singleFieldFirstBuild(), config);
    await runScenario(singleFieldSteadyState(), config);
    await runScenario(twoFieldSteadyState(), config);
    await runScenario(missingValueSteadyState(), config);
    await runScenario(relationValueSteadyState(), config);
  }

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

/** Returns iteration counts that keep 100k-entity runs practical. */
function configForSize(size: number): BenchmarkConfig {
  if (size >= 100_000) return { iterations: 8, size, warmups: 3 };
  if (size >= 50_000) return { iterations: 10, size, warmups: 4 };
  return { iterations: 18, size, warmups: 6 };
}

/** Measures one scenario after warmup and prints a CSV row. */
async function runScenario(scenario: Scenario, config: BenchmarkConfig): Promise<void> {
  for (let i = 0; i < config.warmups; i++) {
    consume(scenario.run(scenario.setup(config.size)));
    forceGc();
  }

  const samples: Sample[] = [];
  for (let i = 0; i < config.iterations; i++) {
    const context = scenario.setup(config.size);
    forceGc();
    const heapBefore = process.memoryUsage().heapUsed;
    const cpuBefore = process.cpuUsage();
    const start = performance.now();
    heldResult = scenario.run(context);
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
      config.size,
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

/** Measures initial index construction for a single primitive field. */
function singleFieldFirstBuild(): Scenario {
  return {
    name: "find_index_single_field_first_build",
    setup: setupContext,
    run(context: ScenarioContext): ScenarioResult {
      const found = context.em.filterEntities(Author, { firstName: "first500" });
      return { checksum: found.length, context };
    },
  };
}

/** Measures repeated indexed lookups on one primitive field. */
function singleFieldSteadyState(): Scenario {
  return {
    name: "find_index_single_field_steady_state",
    setup(size: number): ScenarioContext {
      const context = setupContext(size);
      context.em.filterEntities(Author, { firstName: "first0" });
      return context;
    },
    run(context: ScenarioContext): ScenarioResult {
      let checksum = 0;
      for (let i = 0; i < lookupIterations; i++) {
        checksum += context.em.filterEntities(Author, { firstName: `first${i}` }).length;
      }
      return { checksum, context };
    },
  };
}

/** Measures repeated indexed lookups that intersect two primitive fields. */
function twoFieldSteadyState(): Scenario {
  return {
    name: "find_index_two_field_steady_state",
    setup(size: number): ScenarioContext {
      const context = setupContext(size);
      context.em.filterEntities(Author, { firstName: "first0", age: 20 });
      return context;
    },
    run(context: ScenarioContext): ScenarioResult {
      let checksum = 0;
      for (let i = 0; i < lookupIterations; i++) {
        checksum += context.em.filterEntities(Author, { firstName: `first${i}`, age: 20 + (i % 60) }).length;
      }
      return { checksum, context };
    },
  };
}

/** Measures repeated indexed lookups for values absent from the identity map. */
function missingValueSteadyState(): Scenario {
  return {
    name: "find_index_missing_value_steady_state",
    setup(size: number): ScenarioContext {
      const context = setupContext(size);
      context.em.filterEntities(Author, { firstName: "first0" });
      return context;
    },
    run(context: ScenarioContext): ScenarioResult {
      let checksum = 0;
      for (let i = 0; i < lookupIterations; i++) {
        checksum += context.em.filterEntities(Author, { firstName: `missing${i}` }).length;
      }
      return { checksum, context };
    },
  };
}

/** Measures repeated indexed lookups on m2o relation values. */
function relationValueSteadyState(): Scenario {
  return {
    name: "find_index_relation_value_steady_state",
    setup(size: number): ScenarioContext {
      const context = setupContext(size);
      context.em.filterEntities(Author, { publisher: context.publishers[0] });
      return context;
    },
    run(context: ScenarioContext): ScenarioResult {
      let checksum = 0;
      for (let i = 0; i < lookupIterations; i++) {
        checksum += context.em.filterEntities(Author, {
          publisher: context.publishers[i % context.publishers.length],
        }).length;
      }
      return { checksum, context };
    },
  };
}

/** Creates a fresh EntityManager with hydrated Authors and Publishers. */
function setupContext(size: number): ScenarioContext {
  const em = newEntityManager();
  const publishers = em.hydrate(SmallPublisher, makePublisherRows(publisherCount));
  const entities = em.hydrate(Author, makeAuthorRows(size));
  return { em, entities, publishers };
}

/** Creates Author rows with primitive and relation values needed by index scenarios. */
function makeAuthorRows(size: number): Row[] {
  const rows = new Array<Row>(size);
  for (let i = 0; i < size; i++) {
    rows[i] = {
      id: i + 1,
      first_name: `first${i}`,
      last_name: i % 2 === 0 ? "even" : "odd",
      ssn: `ssn${i}`,
      initials: "fl",
      number_of_books: i % 17,
      is_popular: i % 2 === 0,
      age: 20 + (i % 60),
      graduated,
      nick_names: [`nick${i}`],
      is_funny: i % 3 === 0,
      publisher_id: (i % publisherCount) + 1,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }
  return rows;
}

/** Creates Publisher rows used as m2o targets. */
function makePublisherRows(size: number): Row[] {
  const rows = new Array<Row>(size);
  for (let i = 0; i < size; i++) {
    rows[i] = {
      id: i + 1,
      name: `publisher${i}`,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }
  return rows;
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
  blackhole += result.checksum + result.context.em.numberOfEntities + result.context.entities.length;
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

import { setDefaultEntityLimit, type Entity } from "joist-orm";
import { performance } from "node:perf_hooks";
import { Author, SmallPublisher, type EntityManager, type Publisher, type PublisherId } from "./src/entities";
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
const publisherCount = 100;
const graduated = new Date("2020-01-01T00:00:00.000Z");
const createdAt = new Date("2020-01-01T00:00:00.000Z");
const updatedAt = new Date("2020-01-02T00:00:00.000Z");

/** Benchmarks hot field mutation paths for primitive and m2o setters. */
async function main(): Promise<void> {
  const sizes = readSizes();
  setDefaultEntityLimit(Math.max(...sizes) + 1_000);
  console.log(`node=${process.version} exposeGc=${typeof global.gc === "function"}`);
  console.log("scenario,size,iterations,mean_ms,p50_ms,p90_ms,p99_ms,min_ms,max_ms,rsd,cpu_mean_ms,heap_delta_mb");

  for (const size of sizes) {
    const config = configForSize(size);
    await runScenario(primitiveNoopSet(), config);
    await runScenario(primitiveActualChange(), config);
    await runScenario(primitiveRevertChange(), config);
    await runScenario(primitiveIndexedChange(), config);
    await runScenario(manyToOneEntityChange(), config);
    await runScenario(manyToOneIdChange(), config);
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

/** Sets each Author.firstName to its already-current value. */
function primitiveNoopSet(): Scenario {
  return {
    name: "field_primitive_noop_set",
    setup: setupContext,
    run(context: ScenarioContext): ScenarioResult {
      let checksum = 0;
      for (let i = 0; i < context.entities.length; i++) {
        const entity = context.entities[i];
        entity.firstName = `first${i}`;
        checksum += entity.firstName.length;
      }
      return { checksum, context };
    },
  };
}

/** Sets each Author.firstName to a different string. */
function primitiveActualChange(): Scenario {
  return {
    name: "field_primitive_actual_change",
    setup: setupContext,
    run(context: ScenarioContext): ScenarioResult {
      let checksum = 0;
      for (let i = 0; i < context.entities.length; i++) {
        const entity = context.entities[i];
        entity.firstName = `changed${i}`;
        checksum += entity.firstName.length;
      }
      return { checksum, context };
    },
  };
}

/** Reverts each Author.firstName to its original hydrated value. */
function primitiveRevertChange(): Scenario {
  return {
    name: "field_primitive_revert_change",
    setup(size: number): ScenarioContext {
      const context = setupContext(size);
      for (let i = 0; i < context.entities.length; i++) {
        context.entities[i].firstName = `changed${i}`;
      }
      return context;
    },
    run(context: ScenarioContext): ScenarioResult {
      let checksum = 0;
      for (let i = 0; i < context.entities.length; i++) {
        const entity = context.entities[i];
        entity.firstName = `first${i}`;
        checksum += entity.firstName.length;
      }
      return { checksum, context };
    },
  };
}

/** Sets primitive fields after the Author type has active field indexes. */
function primitiveIndexedChange(): Scenario {
  return {
    name: "field_primitive_indexed_change",
    setup(size: number): ScenarioContext {
      const context = setupContext(size);
      context.em.filterEntities(Author, { firstName: "first0" });
      return context;
    },
    run(context: ScenarioContext): ScenarioResult {
      let checksum = 0;
      for (let i = 0; i < context.entities.length; i++) {
        const entity = context.entities[i];
        entity.firstName = `changed${i}`;
        checksum += entity.firstName.length;
      }
      return { checksum, context };
    },
  };
}

/** Sets Author.publisher from loaded Publisher entity instances. */
function manyToOneEntityChange(): Scenario {
  return {
    name: "field_m2o_entity_change",
    setup: setupContext,
    run(context: ScenarioContext): ScenarioResult {
      let checksum = 0;
      for (let i = 0; i < context.entities.length; i++) {
        const entity = context.entities[i];
        entity.publisher.set(context.publishers[i % context.publishers.length]);
        checksum += entity.publisher.id.length;
      }
      return { checksum, context };
    },
  };
}

/** Sets Author.publisher from tagged Publisher ids. */
function manyToOneIdChange(): Scenario {
  return {
    name: "field_m2o_id_change",
    setup: setupContext,
    run(context: ScenarioContext): ScenarioResult {
      let checksum = 0;
      for (let i = 0; i < context.entities.length; i++) {
        const entity = context.entities[i];
        entity.publisher.id = `p:${(i % context.publishers.length) + 1}` as PublisherId;
        checksum += entity.publisher.id.length;
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

/** Creates Author rows with fields needed by mutation and index scenarios. */
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

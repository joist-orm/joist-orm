import { getEmInternalApi, setDefaultEntityLimit } from "joist-orm";
import { performance } from "node:perf_hooks";
import { Author, type EntityManager } from "./src/entities";
import { newEntityManager, testDriver } from "./src/testEm";

type Row = Record<string, unknown>;

interface ScenarioContext {
  authors: Author[];
  em: EntityManager;
}

interface ScenarioResult {
  checksum: number;
  context: ScenarioContext;
}

interface Scenario {
  name: string;
  setup(size: number): Promise<ScenarioContext> | ScenarioContext;
  run(context: ScenarioContext): Promise<ScenarioResult> | ScenarioResult;
}

interface Sample {
  cpuSystemMs: number;
  cpuUserMs: number;
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
const createdAt = new Date("2020-01-01T00:00:00.000Z");
const updatedAt = new Date("2020-01-02T00:00:00.000Z");

/** Benchmarks phase 10 reactive queueing and recalculation hot paths. */
async function main(): Promise<void> {
  const sizes = readSizes();
  setDefaultEntityLimit(Math.max(...sizes) + 1_000);
  console.log(`node=${process.version} exposeGc=${typeof global.gc === "function"}`);
  console.log(
    "scenario,size,samples,p50_ms,p90_ms,p99_ms,mean_ms,rsd_pct,cpu_user_ms,cpu_system_ms,heap_delta_mb,heap_retained_mb",
  );

  for (const size of sizes) {
    const config = configForSize(size);
    await runScenario(queueNoReactables(), config);
    await runScenario(queueOneReaction(), config);
    await runScenario(queueMultipleDownstream(), config);
    await runScenario(queueCreatedAllDownstream(), config);
    await runScenario(queueDeletedAllDownstream(), config);
    await runScenario(recalcOneReaction(), config);
    await runScenario(recalcMultipleDownstream(), config);
  }

  if (blackhole === Number.MIN_SAFE_INTEGER) console.log(blackhole);
  await testDriver.destroy();
}

/** Returns the sizes to benchmark, allowing BENCH_SIZES=10000,50000 overrides. */
function readSizes(): number[] {
  const input = process.env.BENCH_SIZES;
  if (!input) return [1_000, 10_000, 50_000, 100_000];
  return input.split(",").map(function parseSize(value) {
    return Number(value.trim());
  });
}

/** Returns iteration counts that keep 100k-entity runs practical. */
function configForSize(size: number): BenchmarkConfig {
  const iterations = Number(process.env.BENCH_ITERATIONS);
  const warmups = Number(process.env.BENCH_WARMUPS);
  if (iterations > 0 && warmups >= 0) return { iterations, size, warmups };
  if (size >= 100_000) return { iterations: 8, size, warmups: 3 };
  if (size >= 50_000) return { iterations: 10, size, warmups: 4 };
  return { iterations: 18, size, warmups: 6 };
}

/** Measures one scenario after warmup and prints a CSV row. */
async function runScenario(scenario: Scenario, config: BenchmarkConfig): Promise<void> {
  for (let i = 0; i < config.warmups; i++) {
    consume(await scenario.run(await scenario.setup(config.size)));
    forceGc();
  }

  const samples: Sample[] = [];
  for (let i = 0; i < config.iterations; i++) {
    const context = await scenario.setup(config.size);
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

/** Mutates a field that has no downstream reactables to measure baseline setter queue overhead. */
function queueNoReactables(): Scenario {
  return {
    name: "reactive_queue_no_reactables",
    setup: setupContext,
    run(context: ScenarioContext): ScenarioResult {
      let checksum = 0;
      for (let i = 0; i < context.authors.length; i++) {
        const author = context.authors[i];
        author.lastName = `changed${i}`;
        checksum += author.lastName?.length ?? 0;
      }
      return { checksum, context };
    },
  };
}

/** Mutates Author.ssn, which queues one simple same-entity reaction. */
function queueOneReaction(): Scenario {
  return {
    name: "reactive_queue_one_reaction",
    setup: setupContext,
    run(context: ScenarioContext): ScenarioResult {
      let checksum = 0;
      for (let i = 0; i < context.authors.length; i++) {
        const author = context.authors[i];
        author.ssn = `changed${i}`;
        checksum += author.ssn?.length ?? 0;
      }
      return { checksum, context };
    },
  };
}

/** Mutates Author.nickNames, which queues one reactive field and multiple reactions. */
function queueMultipleDownstream(): Scenario {
  return {
    name: "reactive_queue_multiple_downstream",
    setup: setupContext,
    run(context: ScenarioContext): ScenarioResult {
      let checksum = 0;
      for (let i = 0; i < context.authors.length; i++) {
        const author = context.authors[i];
        author.nickNames = [`changed${i}`];
        checksum += author.nickNames?.[0]?.length ?? 0;
      }
      return { checksum, context };
    },
  };
}

/** Queues all downstream reactables via the create path without recalculating them. */
function queueCreatedAllDownstream(): Scenario {
  return {
    name: "reactive_queue_created_all_downstream",
    setup: setupContext,
    run(context: ScenarioContext): ScenarioResult {
      const rm = getEmInternalApi(context.em).rm;
      for (let i = 0; i < context.authors.length; i++) {
        rm.queueAllDownstreamFields(context.authors[i], "created");
      }
      return { checksum: context.authors.length, context };
    },
  };
}

/** Queues all downstream reactables via the delete path without recalculating them. */
function queueDeletedAllDownstream(): Scenario {
  return {
    name: "reactive_queue_deleted_all_downstream",
    setup: setupContext,
    run(context: ScenarioContext): ScenarioResult {
      const rm = getEmInternalApi(context.em).rm;
      for (let i = 0; i < context.authors.length; i++) {
        rm.queueAllDownstreamFields(context.authors[i], "deleted");
      }
      return { checksum: context.authors.length, context };
    },
  };
}

/** Recalculates the simple same-entity Author.ssn reaction after setup queued it. */
function recalcOneReaction(): Scenario {
  return {
    name: "reactive_recalc_one_reaction",
    setup(size: number): ScenarioContext {
      const context = setupContext(size);
      for (let i = 0; i < context.authors.length; i++) {
        context.authors[i].ssn = `changed${i}`;
      }
      return context;
    },
    async run(context: ScenarioContext): Promise<ScenarioResult> {
      await getEmInternalApi(context.em).rm.recalcPendingReactables("reactables");
      return { checksum: countAfterMetadataReactions(context.authors), context };
    },
  };
}

/** Recalculates Author.nickNames downstream reactive field and reactions after setup queued them. */
function recalcMultipleDownstream(): Scenario {
  return {
    name: "reactive_recalc_multiple_downstream",
    setup(size: number): ScenarioContext {
      const context = setupContext(size);
      for (let i = 0; i < context.authors.length; i++) {
        context.authors[i].nickNames = [`changed${i}`];
      }
      return context;
    },
    async run(context: ScenarioContext): Promise<ScenarioResult> {
      await getEmInternalApi(context.em).rm.recalcPendingReactables("reactables");
      return { checksum: countNickNameReactions(context.authors), context };
    },
  };
}

/** Creates a fresh EntityManager with hydrated Authors. */
function setupContext(size: number): ScenarioContext {
  const em = newEntityManager();
  const authors = em.hydrate(Author, makeAuthorRows(size));
  return { authors, em };
}

/** Creates Author rows with fields needed by reactive scenarios. */
function makeAuthorRows(size: number): Row[] {
  const rows = new Array<Row>(size);
  for (let i = 0; i < size; i++) {
    rows[i] = {
      id: i + 1,
      first_name: `first${i}`,
      last_name: `last${i}`,
      ssn: `ssn${i}`,
      initials: "fl",
      number_of_books: 0,
      is_popular: false,
      age: 20 + (i % 60),
      graduated: createdAt,
      nick_names: [`nick${i}`],
      nick_names_upper: [`NICK${i}`],
      is_funny: true,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }
  return rows;
}

/** Counts completed ssn reactions to keep recalc work observable. */
function countAfterMetadataReactions(authors: readonly Author[]): number {
  let checksum = 0;
  for (let i = 0; i < authors.length; i++) {
    checksum += authors[i].transientFields.reactions.afterMetadata;
  }
  return checksum;
}

/** Counts completed nickName-derived work to keep recalc work observable. */
function countNickNameReactions(authors: readonly Author[]): number {
  let checksum = 0;
  for (let i = 0; i < authors.length; i++) {
    const author = authors[i];
    checksum += author.transientFields.reactions.observedNickNames.length;
    checksum += author.transientFields.reactions.runOnce;
    checksum += author.nickNamesUpper.get.length;
  }
  return checksum;
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
      samples.map(function readSystemCpu(sample) {
        return sample.cpuSystemMs;
      }),
    ),
    cpuUserMs: mean(
      samples.map(function readUserCpu(sample) {
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
  blackhole += result.checksum + result.context.em.numberOfEntities + result.context.authors.length;
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

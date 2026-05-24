import { setDefaultEntityLimit, type Entity } from "joist-orm";
import { performance } from "node:perf_hooks";
import { Author, Task, type EntityManager } from "./src/entities";
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

/** Benchmarks EntityManager.hydrate registration and existing-entity overwrite paths. */
async function main(): Promise<void> {
  const sizes = readSizes();
  setDefaultEntityLimit(Math.max(...sizes) + 1_000);
  console.log(`node=${process.version} exposeGc=${typeof global.gc === "function"}`);
  console.log("scenario,size,iterations,mean_ms,p50_ms,p90_ms,p99_ms,min_ms,max_ms,rsd,cpu_mean_ms,heap_delta_mb");

  for (const size of sizes) {
    const authorRows = makeAuthorRows(size);
    const taskRows = makeTaskRows(size);
    const config = configForSize(size);
    await runScenario(authorFreshRegister(), authorRows, config);
    await runScenario(authorFreshWithScalarReads(), authorRows, config);
    await runScenario(authorExistingNoOverwrite(), authorRows, config);
    await runScenario(authorExistingOverwriteColdData(), authorRows, config);
    await runScenario(authorExistingOverwriteWarmData(), authorRows, config);
    await runScenario(taskStiFreshRegister(), taskRows, config);
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
  if (size >= 100_000) return { iterations: 8, size, warmups: 3 };
  if (size >= 50_000) return { iterations: 10, size, warmups: 4 };
  return { iterations: 18, size, warmups: 6 };
}

/** Measures one scenario after warmup and prints a CSV row. */
async function runScenario(scenario: Scenario, rows: readonly Row[], config: BenchmarkConfig): Promise<void> {
  for (let i = 0; i < config.warmups; i++) {
    consume(scenario.run(rows));
    forceGc();
  }

  const samples: Sample[] = [];
  for (let i = 0; i < config.iterations; i++) {
    forceGc();
    const heapBefore = process.memoryUsage().heapUsed;
    const cpuBefore = process.cpuUsage();
    const start = performance.now();
    heldResult = scenario.run(rows);
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

/** Hydrates Authors into a fresh EntityManager without touching scalar fields. */
function authorFreshRegister(): Scenario {
  return {
    name: "author_fresh_register",
    run(rows: readonly Row[]): ScenarioResult {
      const em = newEntityManager();
      const entities = em.hydrate(Author, rows);
      return { checksum: entities.length, em, entities };
    },
  };
}

/** Hydrates Authors and lazily reads common scalar fields. */
function authorFreshWithScalarReads(): Scenario {
  return {
    name: "author_fresh_register_scalar_reads",
    run(rows: readonly Row[]): ScenarioResult {
      const em = newEntityManager();
      const entities = em.hydrate(Author, rows);
      const checksum = readAuthorScalars(entities);
      return { checksum, em, entities };
    },
  };
}

/** Hydrates duplicate Author rows without overwriting existing entities. */
function authorExistingNoOverwrite(): Scenario {
  return {
    name: "author_existing_no_overwrite",
    run(rows: readonly Row[]): ScenarioResult {
      const em = newEntityManager();
      em.hydrate(Author, rows);
      const entities = em.hydrate(Author, rows, { overwriteExisting: false });
      return { checksum: entities.length, em, entities };
    },
  };
}

/** Hydrates duplicate Author rows with overwriteExisting but no hydrated scalar data. */
function authorExistingOverwriteColdData(): Scenario {
  return {
    name: "author_existing_overwrite_cold_data",
    run(rows: readonly Row[]): ScenarioResult {
      const em = newEntityManager();
      em.hydrate(Author, rows);
      const entities = em.hydrate(Author, rows, { overwriteExisting: true });
      return { checksum: entities.length, em, entities };
    },
  };
}

/** Hydrates duplicate Author rows with overwriteExisting after scalar fields are in InstanceData.data. */
function authorExistingOverwriteWarmData(): Scenario {
  return {
    name: "author_existing_overwrite_warm_data",
    run(rows: readonly Row[]): ScenarioResult {
      const em = newEntityManager();
      const before = em.hydrate(Author, rows);
      const checksum = readAuthorScalars(before);
      const entities = em.hydrate(Author, rows, { overwriteExisting: true });
      return { checksum: checksum + entities.length, em, entities };
    },
  };
}

/** Hydrates STI Task rows into TaskOld/TaskNew subtypes. */
function taskStiFreshRegister(): Scenario {
  return {
    name: "task_sti_fresh_register",
    run(rows: readonly Row[]): ScenarioResult {
      const em = newEntityManager();
      const entities = em.hydrate(Task, rows);
      return { checksum: entities.length, em, entities };
    },
  };
}

/** Creates Author rows with enough columns to exercise scalar serde after reads. */
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

/** Creates alternating TaskOld/TaskNew STI rows. */
function makeTaskRows(size: number): Row[] {
  const rows = new Array<Row>(size);
  for (let i = 0; i < size; i++) {
    rows[i] = {
      id: i + 1,
      duration_in_days: 1 + (i % 30),
      type_id: i % 2 === 0 ? 1 : 2,
      special_old_field: i,
      special_new_field: i,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }
  return rows;
}

/** Reads Author scalars that are common in find/list hot paths. */
function readAuthorScalars(entities: readonly Author[]): number {
  let checksum = 0;
  for (const author of entities) {
    checksum += author.id.length;
    checksum += author.firstName.length;
    checksum += author.lastName?.length ?? 0;
    checksum += author.age ?? 0;
    checksum += author.isFunny ? 1 : 0;
    checksum += author.graduated?.getTime() ?? 0;
    checksum += author.nickNames?.length ?? 0;
  }
  return checksum;
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

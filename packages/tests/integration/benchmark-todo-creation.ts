import { setDefaultEntityLimit, type Entity } from "joist-orm";
import { performance } from "node:perf_hooks";
import { createTodos, Todo } from "../../core/src/Todo";
import { Author, EntityManager, newAuthor, newTaskNew, newTaskOld } from "./src/entities";

type Row = Record<string, unknown>;

interface ScenarioContext {
  entities: Entity[];
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
const graduated = new Date("2020-01-01T00:00:00.000Z");
const createdAt = new Date("2020-01-01T00:00:00.000Z");
const updatedAt = new Date("2020-01-02T00:00:00.000Z");

/** Benchmarks Todo creation and grouping over prepared pending entity sets. */
async function main(): Promise<void> {
  const sizes = readSizes();
  setDefaultEntityLimit(Math.max(...sizes) + 1_000);
  console.log(`node=${process.version} exposeGc=${typeof global.gc === "function"}`);
  console.log("scenario,size,iterations,mean_ms,p50_ms,p90_ms,p99_ms,min_ms,max_ms,rsd,cpu_mean_ms,heap_delta_mb");

  for (const size of sizes) {
    const config = configForSize(size);
    await runScenario(homogeneousInserts(), config);
    await runScenario(homogeneousInsertGrouping(), config);
    await runScenario(mixedOperations(), config);
    await runScenario(stiInserts(), config);
    await runScenario(stiInsertGrouping(), config);
    await new Promise<void>(resolveImmediate);
  }

  if (blackhole === Number.MIN_SAFE_INTEGER) console.log(blackhole);
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
  if (size >= 100_000) return { iterations: 8, size, warmups: 3 };
  if (size >= 50_000) return { iterations: 12, size, warmups: 4 };
  return { iterations: 20, size, warmups: 6 };
}

/** Measures one scenario after warmup and prints a CSV row. */
async function runScenario(scenario: Scenario, config: BenchmarkConfig): Promise<void> {
  const context = scenario.setup(config.size);
  for (let i = 0; i < config.warmups; i++) {
    consume(scenario.run(context));
    forceGc();
  }

  const samples: Sample[] = [];
  for (let i = 0; i < config.iterations; i++) {
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

/** Creates a homogeneous Author insert todo scenario. */
function homogeneousInserts(): Scenario {
  return {
    name: "todo_author_inserts",
    setup(size: number): ScenarioContext {
      const em = newEntityManager();
      return { entities: makeNewAuthors(em, size) };
    },
    run(context: ScenarioContext): ScenarioResult {
      return { checksum: checksumTodos(createTodos(context.entities)), context };
    },
  };
}

/** Creates a homogeneous Author insert todo and grouping scenario. */
function homogeneousInsertGrouping(): Scenario {
  return {
    name: "todo_group_author_inserts",
    setup(size: number): ScenarioContext {
      const em = newEntityManager();
      return { entities: makeNewAuthors(em, size) };
    },
    run(context: ScenarioContext): ScenarioResult {
      const todos = createTodos(context.entities);
      return { checksum: checksumGroups(Todo.groupInsertsByTypeAndSubType(todos)), context };
    },
  };
}

/** Creates a mixed insert/update/delete todo scenario. */
function mixedOperations(): Scenario {
  return {
    name: "todo_mixed_author_ops",
    setup(size: number): ScenarioContext {
      const em = newEntityManager();
      const newEntities = makeNewAuthors(em, Math.floor(size / 3));
      const existingEntities = em.hydrate(Author, makeAuthorRows(size - newEntities.length));
      for (let i = 0; i < existingEntities.length; i++) {
        if (i % 2 === 0) {
          existingEntities[i].firstName = `changed${i}`;
        } else {
          em.delete(existingEntities[i]);
        }
      }
      return { entities: [...newEntities, ...existingEntities] };
    },
    run(context: ScenarioContext): ScenarioResult {
      return { checksum: checksumTodos(createTodos(context.entities)), context };
    },
  };
}

/** Creates an STI Task insert todo scenario. */
function stiInserts(): Scenario {
  return {
    name: "todo_sti_task_inserts",
    setup(size: number): ScenarioContext {
      const em = newEntityManager();
      return { entities: makeNewTasks(em, size) };
    },
    run(context: ScenarioContext): ScenarioResult {
      return { checksum: checksumTodos(createTodos(context.entities)), context };
    },
  };
}

/** Creates an STI Task insert todo and grouping scenario. */
function stiInsertGrouping(): Scenario {
  return {
    name: "todo_group_sti_task_inserts",
    setup(size: number): ScenarioContext {
      const em = newEntityManager();
      return { entities: makeNewTasks(em, size) };
    },
    run(context: ScenarioContext): ScenarioResult {
      const todos = createTodos(context.entities);
      return { checksum: checksumGroups(Todo.groupInsertsByTypeAndSubType(todos)), context };
    },
  };
}

/** Creates new Author entities without measuring factory setup. */
function makeNewAuthors(em: EntityManager, size: number): Entity[] {
  const entities = new Array<Entity>(size);
  for (let i = 0; i < size; i++) {
    entities[i] = newAuthor(em, { firstName: `first${i}`, lastName: `last${i}`, ssn: `ssn${i}` });
  }
  return entities;
}

/** Creates alternating TaskNew/TaskOld entities without measuring factory setup. */
function makeNewTasks(em: EntityManager, size: number): Entity[] {
  const entities = new Array<Entity>(size);
  for (let i = 0; i < size; i++) {
    entities[i] = i % 2 === 0 ? newTaskNew(em, { specialNewField: i }) : newTaskOld(em, { specialOldField: i });
  }
  return entities;
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

/** Creates an EntityManager backed by an in-memory noop driver. */
function newEntityManager(): EntityManager {
  const ctx = {};
  const em = new EntityManager(ctx, { driver: noopDriver() });
  Object.assign(ctx, { em });
  return em;
}

/** Implements only the driver surface needed for in-memory entity creation. */
function noopDriver(): EntityManager["driver"] {
  return {
    defaultPlugins: [],
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

/** Reads todo sizes so created structures remain observable. */
function checksumTodos(todos: Record<string, Todo>): number {
  let sum = 0;
  for (const todo of Object.values(todos)) {
    sum += todo.inserts.length + todo.updates.length * 2 + todo.deletes.length * 3;
  }
  return sum;
}

/** Reads grouped insert sizes so grouping remains observable. */
function checksumGroups(groups: Map<unknown, Entity[]>): number {
  let sum = 0;
  for (const entities of groups.values()) {
    sum += entities.length;
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
function percentile(sortedValues: readonly number[], percentileValue: number): number {
  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * percentileValue) - 1);
  return sortedValues[index];
}

/** Returns the population standard deviation. */
function standardDeviation(values: readonly number[], meanValue: number): number {
  const variance = mean(
    values.map(function squareDistance(value) {
      return (value - meanValue) ** 2;
    }),
  );
  return Math.sqrt(variance);
}

/** Formats CSV numeric output consistently. */
function fmt(value: number): string {
  return value.toFixed(3);
}

/** Keeps benchmark results observable across samples. */
function consume(result: ScenarioResult): void {
  blackhole += result.checksum;
}

/** Forces GC when the benchmark was launched with node --expose-gc. */
function forceGc(): void {
  if (global.gc) global.gc();
}

/** Resolves on the next check phase to yield between samples. */
function resolveImmediate(resolve: () => void): void {
  setImmediate(resolve);
}

main().catch(function handleError(error) {
  console.error(error);
  process.exitCode = 1;
});

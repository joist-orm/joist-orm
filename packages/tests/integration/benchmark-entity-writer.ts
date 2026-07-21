import { performance } from "node:perf_hooks";
import { getInstanceData } from "../../core/src/BaseEntity";
import { type Entity } from "../../core/src/Entity";
import { type EntityMetadata, type Field } from "../../core/src/EntityMetadata";
import { InstanceData } from "../../core/src/InstanceData";
import { Todo } from "../../core/src/Todo";
import { generateOps, type OpColumn } from "../../core/src/drivers/EntityWriter";

interface ScenarioContext {
  todo: Todo;
}

interface ScenarioResult {
  checksum: number;
  context: ScenarioContext;
}

interface Scenario {
  columnCount: number;
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

interface SyntheticData {
  changedFields: string[];
  data: Record<string, number>;
  isTouched: boolean;
  originalData: Record<string, number>;
}

type SyntheticColumn = OpColumn & { dbValue(data: Record<string, number>): number | undefined };
type SyntheticField = Field & { serde: { columns: SyntheticColumn[] } };
type SyntheticEntityMetadata = EntityMetadata & { fields: Record<string, SyntheticField> };
type SyntheticEntity = Entity & { __data: SyntheticData };

let blackhole = 0;
let heldResult: ScenarioResult | undefined;

/** Benchmarks EntityWriter SQL op generation and columnar binding collection. */
async function main(): Promise<void> {
  const sizes = readSizes();
  console.log(`node=${process.version} exposeGc=${typeof global.gc === "function"}`);
  console.log(
    "scenario,size,columns,iterations,mean_ms,p50_ms,p90_ms,p99_ms,min_ms,max_ms,rsd,cpu_mean_ms,heap_delta_mb",
  );

  for (const size of sizes) {
    const config = configForSize(size);
    for (const columnCount of readColumnCounts()) {
      await runScenario(insertOps(columnCount), config);
      await runScenario(updateOpsSameField(columnCount), config);
      await runScenario(updateOpsDistinctFields(columnCount), config);
      await new Promise<void>(resolveImmediate);
    }
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

/** Returns synthetic column counts, allowing BENCH_COLUMNS=5,20,50 overrides. */
function readColumnCounts(): number[] {
  const input = process.env.BENCH_COLUMNS;
  if (!input) return [5, 20, 50];
  return input.split(",").map(function parseColumnCount(value) {
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
      scenario.columnCount,
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

/** Creates an insert operation generation scenario. */
function insertOps(columnCount: number): Scenario {
  return {
    columnCount,
    name: "writer_insert_ops",
    setup(size: number): ScenarioContext {
      const meta = makeMetadata(columnCount);
      const todo = new Todo(meta);
      todo.inserts = makeEntities(meta, size, columnCount, "insert");
      return { todo };
    },
    run(context: ScenarioContext): ScenarioResult {
      return { checksum: checksumOps(generateOps({ synthetic: context.todo })), context };
    },
  };
}

/** Creates an update operation scenario where all rows change one field. */
function updateOpsSameField(columnCount: number): Scenario {
  return {
    columnCount,
    name: "writer_update_same_field_ops",
    setup(size: number): ScenarioContext {
      const meta = makeMetadata(columnCount);
      const todo = new Todo(meta);
      todo.updates = makeEntities(meta, size, columnCount, "same-update");
      return { todo };
    },
    run(context: ScenarioContext): ScenarioResult {
      return { checksum: checksumOps(generateOps({ synthetic: context.todo })), context };
    },
  };
}

/** Creates an update scenario where changed-field signatures vary across rows. */
function updateOpsDistinctFields(columnCount: number): Scenario {
  return {
    columnCount,
    name: "writer_update_distinct_fields_ops",
    setup(size: number): ScenarioContext {
      const meta = makeMetadata(columnCount);
      const todo = new Todo(meta);
      todo.updates = makeEntities(meta, size, columnCount, "distinct-update");
      return { todo };
    },
    run(context: ScenarioContext): ScenarioResult {
      return { checksum: checksumOps(generateOps({ synthetic: context.todo })), context };
    },
  };
}

/** Creates synthetic metadata with one id column plus N value columns. */
function makeMetadata(columnCount: number): SyntheticEntityMetadata {
  const fields: Record<string, SyntheticField> = {};
  for (let i = 0; i < columnCount; i++) {
    const fieldName = i === 0 ? "id" : `field${i}`;
    fields[fieldName] = makeField(fieldName, i === 0 ? "id" : `field_${i}`);
  }
  return {
    allFields: fields,
    baseTypes: [],
    fields,
    inheritanceType: undefined,
    lazyFieldNames: new Set<string>(),
    nonDeferredFkOrder: 0,
    subTypes: [],
    tableName: "synthetic_entities",
    tagName: "synthetic",
    type: "SyntheticEntity",
  } as SyntheticEntityMetadata;
}

/** Creates a synthetic field that reads values from InstanceData.data. */
function makeField(fieldName: string, columnName: string): SyntheticField {
  return {
    fieldName,
    kind: fieldName === "id" ? "primaryKey" : "primitive",
    serde: {
      columns: [
        {
          columnName,
          dbType: "int",
          dbValue(data: Record<string, number>): number | undefined {
            return data[fieldName];
          },
        },
      ],
    },
  } as SyntheticField;
}

/** Creates synthetic entities with pre-hydrated data and update tracking. */
function makeEntities(
  meta: EntityMetadata,
  size: number,
  columnCount: number,
  mode: "insert" | "same-update" | "distinct-update",
): Entity[] {
  const entities = new Array<Entity>(size);
  for (let i = 0; i < size; i++) {
    const data = makeData(i, columnCount);
    const changedFields = changedFieldsFor(i, columnCount, mode);
    entities[i] = makeEntity(meta, data, changedFields);
  }
  return entities;
}

/** Creates deterministic field values for one synthetic entity. */
function makeData(index: number, columnCount: number): Record<string, number> {
  const data: Record<string, number> = { id: index + 1 };
  for (let i = 1; i < columnCount; i++) data[`field${i}`] = index + i;
  return data;
}

/** Returns changed fields for each update mode. */
function changedFieldsFor(
  index: number,
  columnCount: number,
  mode: "insert" | "same-update" | "distinct-update",
): string[] {
  if (mode === "insert") return [];
  if (mode === "same-update") return ["field1"];
  return [`field${1 + (index % Math.max(1, columnCount - 1))}`];
}

/** Creates the minimum entity shape needed by EntityWriter. */
function makeEntity(meta: EntityMetadata, data: Record<string, number>, changedFields: string[]): Entity {
  const instanceData = Object.create(InstanceData.prototype) as SyntheticData;
  instanceData.data = data;
  const originalData: Record<string, number> = {};
  for (const fieldName of changedFields) originalData[fieldName] = data[fieldName] - 1;
  // Shadow the prototype getters, since this fake instance skips the constructor (and its private fields)
  Object.defineProperty(instanceData, "originalData", { value: originalData });
  Object.defineProperty(instanceData, "changedData", { value: originalData });
  Object.defineProperty(instanceData, "changedFields", { get: readChangedFields });
  Object.defineProperty(instanceData, "isTouched", { value: false });
  Object.defineProperty(instanceData, "metadata", { value: meta });

  const entity = {} as SyntheticEntity;
  Object.defineProperty(entity, "__data", { value: instanceData });
  return entity;
}

/** Returns changed fields from synthetic originalData. */
function readChangedFields(this: SyntheticData): string[] {
  return Object.keys(this.originalData);
}

/** Reads op sizes so generated structures remain observable. */
function checksumOps(ops: ReturnType<typeof generateOps>): number {
  let sum = ops.inserts.length * 11 + ops.updates.length * 13 + ops.deletes.length * 17;
  for (const op of ops.inserts) sum += op.columns.length + op.columnValues.length;
  for (const op of ops.updates) sum += op.columns.length + op.columnValues.length;
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
  blackhole +=
    result.checksum + getInstanceData(result.context.todo.inserts[0] ?? result.context.todo.updates[0]).data.id;
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

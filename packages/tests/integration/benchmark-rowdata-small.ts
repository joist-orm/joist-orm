import { PojoRowData, setDefaultEntityLimit } from "joist-orm";
import { WireRowData } from "joist-orm/pg";
import { performance } from "node:perf_hooks";
import { Author } from "./src/entities";
import { newEntityManager, pool, testDriver } from "./src/testEm";

/**
 * Measures whether lazy `WireRowData` results are slower than classic/materialized rows for
 * SMALL result sets (1-1000 rows), i.e. the common `em.find` that returns a handful of entities.
 *
 * Two sections:
 *
 * 1. End-to-end `em.find` at each size, in whichever mode `JOIST_ROW_DATA` selects — run once
 *    per mode and compare. This includes the DB round-trip, so µs-level representation costs
 *    may be invisible here (which is itself a finding).
 * 2. A no-network microbenchmark of just the representation work, using synthesized 40-column
 *    DataRow payloads: "wire" keeps the WireRowData and lazily faults fields, vs "pojo" which
 *    eagerly materializes the same payloads to POJO rows (`toRows`) and reads fields from them.
 *    This isolates the CPU crossover that motivates WireRowData's small-result threshold.
 *
 * Note this resets the shared test database (via flush_database) before and after.
 */
async function main(): Promise<void> {
  const seed = 5_000;
  setDefaultEntityLimit(seed + 1_000);
  const mode = process.env.JOIST_ROW_DATA === "1" ? "lazy" : "classic";
  console.log(`node=${process.version} exposeGc=${typeof global.gc === "function"} mode=${mode}`);

  try {
    await pool.query("select flush_database()");
    // Seed with age=i so `age <= n` returns exactly n rows
    await pool.query(`
      INSERT INTO authors (first_name, last_name, ssn, number_of_books, age, created_at, updated_at)
      SELECT 'first' || i, 'last' || i, 'ssn' || i, i % 17, i, now(), now()
      FROM generate_series(1, ${seed}) i
    `);

    console.log("section,scenario,rows,iterations,mean_us,min_us,p50_us");
    for (const n of [1, 2, 5, 10, 25, 50, 100, 250, 1000]) {
      const iterations = n <= 100 ? 300 : 60;
      await measure("find", `em_find`, n, iterations, async () => {
        const em = newEntityManager();
        return (await em.find(Author, { age: { lte: n } })).length;
      });
      await measure("find", `em_find_reads`, n, iterations, async () => {
        const em = newEntityManager();
        const authors = await em.find(Author, { age: { lte: n } });
        let checksum = 0;
        for (const author of authors) {
          checksum += author.firstName.length + (author.lastName?.length ?? 0) + (author.age ?? 0);
          checksum += (author.ssn?.length ?? 0) + (author.isFunny ? 1 : 0);
        }
        return checksum > 0 ? authors.length : 0;
      });
    }

    microBenchmark();
  } finally {
    await pool.query("select flush_database()").catch(() => {});
    await testDriver.destroy();
  }
}

/** Compares wire-lazy vs pojo-materialized representation costs with no DB involved. */
function microBenchmark(): void {
  const columnCount = 40;
  const fields = zeroTo(columnCount).map((i) => ({ name: `c${i}`, dataTypeID: 25 }));
  const parsers = zeroTo(columnCount).map(() => identity);
  // Read 6 fields spread across the row, like a typical entity's touched scalars
  const readOrdinals = [0, 3, 8, 15, 25, 39].map((i) => `c${i}`);
  const payload = syntheticPayload(columnCount);

  for (const n of [1, 2, 5, 10, 25, 50, 100, 250, 1000]) {
    const iterations = n <= 100 ? 20_000 : 2_000;
    // Both paths pay the same appendRow streaming cost, so include it in both for realism
    measureSync("micro", "wire_lazy_reads", n, iterations, () => {
      const wire = buildWire(fields, parsers, payload, n);
      let checksum = 0;
      for (let i = 0; i < n; i++) {
        for (const name of readOrdinals) checksum += wire.get(i, name).length;
      }
      for (let i = 0; i < n; i++) wire.retain?.(i);
      wire.finalize?.();
      return checksum;
    });
    measureSync("micro", "pojo_materialize_reads", n, iterations, () => {
      const wire = buildWire(fields, parsers, payload, n);
      const pojo = new PojoRowData(wire.toRows());
      let checksum = 0;
      for (let i = 0; i < n; i++) {
        for (const name of readOrdinals) checksum += pojo.get(i, name).length;
      }
      return checksum;
    });
    // Dense variant: read every column, i.e. the access pattern most favorable to materialization
    const allNames = fields.map((f) => f.name);
    measureSync("micro", "wire_lazy_dense", n, iterations, () => {
      const wire = buildWire(fields, parsers, payload, n);
      let checksum = 0;
      for (let i = 0; i < n; i++) {
        for (const name of allNames) checksum += wire.get(i, name).length;
      }
      for (let i = 0; i < n; i++) wire.retain?.(i);
      wire.finalize?.();
      return checksum;
    });
    measureSync("micro", "pojo_materialize_dense", n, iterations, () => {
      const wire = buildWire(fields, parsers, payload, n);
      const pojo = new PojoRowData(wire.toRows());
      let checksum = 0;
      for (let i = 0; i < n; i++) {
        for (const name of allNames) checksum += pojo.get(i, name).length;
      }
      return checksum;
    });
  }
}

/** Builds a WireRowData with `n` copies of the synthetic payload. */
function buildWire(
  fields: Array<{ name: string; dataTypeID: number }>,
  parsers: any[],
  payload: Buffer,
  n: number,
): WireRowData {
  const wire = new WireRowData();
  wire.setRowDescription(fields, parsers);
  for (let i = 0; i < n; i++) wire.appendRow(payload, 0, payload.length);
  return wire;
}

/** Builds one DataRow payload with `columnCount` short text cells. */
function syntheticPayload(columnCount: number): Buffer {
  const parts: Buffer[] = [Buffer.alloc(2)];
  parts[0].writeInt16BE(columnCount, 0);
  for (let i = 0; i < columnCount; i++) {
    const cell = Buffer.from(`value-${i}-abcdef`, "utf8");
    const len = Buffer.alloc(4);
    len.writeInt32BE(cell.length, 0);
    parts.push(len, cell);
  }
  return Buffer.concat(parts) as Buffer<ArrayBuffer>;
}

/** Times an async `fn`, printing per-op microseconds. */
async function measure(
  section: string,
  scenario: string,
  rows: number,
  iterations: number,
  fn: () => Promise<number>,
): Promise<void> {
  for (let i = 0; i < Math.min(iterations / 10, 20); i++) await fn(); // warmup
  const wall: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const count = await fn();
    wall.push((performance.now() - start) * 1000);
    if (count === 0) throw new Error("expected rows");
  }
  report(section, scenario, rows, iterations, wall);
}

/** Times a sync `fn` in batches, printing per-op microseconds. */
function measureSync(section: string, scenario: string, rows: number, iterations: number, fn: () => number): void {
  for (let i = 0; i < iterations / 10; i++) fn(); // warmup
  const batch = 50;
  const wall: number[] = [];
  for (let i = 0; i < iterations / batch; i++) {
    const start = performance.now();
    for (let j = 0; j < batch; j++) {
      if (fn() === 0) throw new Error("expected checksum");
    }
    wall.push(((performance.now() - start) * 1000) / batch);
  }
  report(section, scenario, rows, iterations, wall);
}

/** Prints a CSV row of per-op stats. */
function report(section: string, scenario: string, rows: number, iterations: number, wall: number[]): void {
  wall.sort((a, b) => a - b);
  const mean = wall.reduce((sum, value) => sum + value, 0) / wall.length;
  console.log(
    [
      section,
      scenario,
      rows,
      iterations,
      mean.toFixed(1),
      wall[0].toFixed(1),
      wall[Math.floor(wall.length / 2)].toFixed(1),
    ].join(","),
  );
}

/** Returns [0, 1, ..., n-1]. */
function zeroTo(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

const identity = (value: string) => value;

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

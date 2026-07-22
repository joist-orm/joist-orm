import { setDefaultEntityLimit } from "joist-orm";
import { performance } from "node:perf_hooks";
import { Author } from "./src/entities";
import { newEntityManager, pool, testDriver } from "./src/testEm";

/**
 * Measures where a large `em.find` spends its time: node-pg wire->POJO parsing vs Joist hydration.
 *
 * This grounds the native/columnar row-store design (see NATIVE-ROW-STORE-DESIGN.md). Seeds
 * BENCH_SIZES authors (default 100k), then times:
 *
 * - pg_pojo: pool.query returning POJO rows (pg's default parse path)
 * - pg_array: pool.query with rowMode array (no per-row POJO key assignment)
 * - hydrate_only: em.hydrate over pre-fetched rows (Joist entity construction only)
 * - em_find: the full em.find path (query + parse + hydrate)
 *
 * Note this resets the shared test database (via flush_database) before and after.
 */
async function main(): Promise<void> {
  const size = Number(process.env.BENCH_SIZES ?? 100_000);
  setDefaultEntityLimit(size + 1_000);
  console.log(`node=${process.version} exposeGc=${typeof global.gc === "function"}`);

  await pool.query("select flush_database()");
  await pool.query(`
    INSERT INTO authors (first_name, last_name, ssn, number_of_books, age, created_at, updated_at)
    SELECT 'first' || i, 'last' || i, 'ssn' || i, i % 17, 20 + (i % 60), now(), now()
    FROM generate_series(1, ${size}) i
  `);

  console.log("scenario,iterations,mean_ms,min_ms,max_ms,heap_delta_mb");
  await measure("pg_pojo", 5, async () => {
    const result = await pool.query("select * from authors");
    return result.rows.length;
  });
  await measure("pg_array", 5, async () => {
    const result = await pool.query({ text: "select * from authors", rowMode: "array" });
    return result.rows.length;
  });
  const { rows } = await pool.query("select * from authors");
  await measure("hydrate_only", 5, async () => {
    const em = newEntityManager();
    return em.hydrate(Author, rows).length;
  });
  await measure("em_find", 5, async () => {
    const em = newEntityManager();
    return (await em.find(Author, {})).length;
  });
  await measure("em_find_scalar_reads", 5, async () => {
    const em = newEntityManager();
    const authors = await em.find(Author, {});
    let checksum = 0;
    for (const author of authors) {
      checksum += author.firstName.length;
      checksum += author.lastName?.length ?? 0;
      checksum += author.ssn?.length ?? 0;
      checksum += author.age ?? 0;
      checksum += author.isFunny ? 1 : 0;
      checksum += author.createdAt instanceof Date ? 1 : 0;
    }
    return checksum > 0 ? authors.length : 0;
  });

  await pool.query("select flush_database()");
  await testDriver.destroy();
}

/** Times `fn` with forced GC around each iteration and prints a CSV row. */
async function measure(name: string, iterations: number, fn: () => Promise<number>): Promise<void> {
  const wall: number[] = [];
  let heapDelta = 0;
  await fn(); // warmup
  for (let i = 0; i < iterations; i++) {
    global.gc?.();
    const heapBefore = process.memoryUsage().heapUsed;
    const start = performance.now();
    const count = await fn();
    wall.push(performance.now() - start);
    global.gc?.();
    heapDelta += (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;
    if (count === 0) throw new Error("expected rows");
  }
  wall.sort((a, b) => a - b);
  const mean = wall.reduce((sum, value) => sum + value, 0) / wall.length;
  console.log(
    [
      name,
      iterations,
      mean.toFixed(1),
      wall[0].toFixed(1),
      wall[wall.length - 1].toFixed(1),
      (heapDelta / iterations).toFixed(1),
    ].join(","),
  );
}

main().catch(async (error) => {
  console.error(error);
  await testDriver.destroy();
  process.exitCode = 1;
});

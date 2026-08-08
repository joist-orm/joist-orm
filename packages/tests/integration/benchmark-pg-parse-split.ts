import { getField, getMetadata, setDefaultEntityLimit } from "joist-orm";
import { performance } from "node:perf_hooks";
import { Author } from "./src/entities";
import { newEntityManager, pool, testDriver } from "./src/testEm";

/**
 * Measures where a large `em.find` spends its time: node-pg wire->POJO parsing vs Joist
 * hydration, in classic vs lazy-rows mode (toggle with `JOIST_ROW_DATA=1`).
 *
 * This grounds the lazy wire-row design (see JS-ROW-STORE-DESIGN.md). Seeds BENCH_SIZES authors
 * (default 100k), then times:
 *
 * - pg_pojo: pool.query returning POJO rows (pg's default parse path)
 * - pg_array: pool.query with rowMode array (no per-row POJO key assignment)
 * - hydrate_only: em.hydrate over pre-fetched rows (Joist entity construction only)
 * - em_find: the full em.find path (query + parse + hydrate)
 * - em_find_scalar_reads: em.find + reading 6 fields on every entity (sparse all-row read)
 * - em_find_dense_reads: em.find + reading every serde'd field on every entity (dense read)
 * - em_find_retained: em.find, then post-GC heap/external growth while HOLDING the result
 *
 * Reports wall time plus `heapUsed`/`external`/RSS deltas, since lazy mode's row bytes live in
 * untraced Buffer memory that `heapUsed` alone would miss.
 *
 * Note this resets the shared test database (via flush_database) before and after.
 */
async function main(): Promise<void> {
  const size = Math.floor(Number(process.env.BENCH_SIZES ?? 100_000));
  if (!Number.isFinite(size) || size <= 0) throw new Error(`Invalid BENCH_SIZES ${process.env.BENCH_SIZES}`);
  setDefaultEntityLimit(size + 1_000);
  const mode = process.env.JOIST_ROW_DATA === "1" ? "lazy" : "classic";
  console.log(`node=${process.version} exposeGc=${typeof global.gc === "function"} mode=${mode} size=${size}`);

  try {
    await pool.query("select flush_database()");
    await pool.query(`
      INSERT INTO authors (first_name, last_name, ssn, number_of_books, age, created_at, updated_at)
      SELECT 'first' || i, 'last' || i, 'ssn' || i, i % 17, 20 + (i % 60), now(), now()
      FROM generate_series(1, ${size}) i
    `);

    console.log("scenario,iterations,mean_ms,min_ms,max_ms,heap_delta_mb,external_delta_mb,rss_delta_mb");
    // Measure retained memory first, against the cleanest possible baseline: later scenarios can
    // leave one result pinned in stale async-frame registers, which cancels the retained delta
    await measureRetained(size);
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
    // Dense read: every serde-backed field on every entity, the design's bounded worst case
    const denseFields = Object.values(getMetadata(Author).allFields)
      .filter((f) => f.serde !== undefined)
      .map((f) => f.fieldName);
    await measure("em_find_dense_reads", 3, async () => {
      const em = newEntityManager();
      const authors = await em.find(Author, {});
      let checksum = 0;
      for (const author of authors) {
        for (const fieldName of denseFields) {
          checksum += getField(author, fieldName) !== undefined ? 1 : 0;
        }
      }
      return checksum > 0 ? authors.length : 0;
    });
  } finally {
    await pool.query("select flush_database()").catch(() => {});
    await testDriver.destroy();
  }
}

/** Times `fn` with forced GC around each iteration and prints a CSV row. */
async function measure(name: string, iterations: number, fn: () => Promise<number>): Promise<void> {
  const wall: number[] = [];
  let heapDelta = 0;
  let externalDelta = 0;
  let rssDelta = 0;
  await fn(); // warmup
  for (let i = 0; i < iterations; i++) {
    global.gc?.();
    const before = process.memoryUsage();
    const start = performance.now();
    const count = await fn();
    wall.push(performance.now() - start);
    global.gc?.();
    const after = process.memoryUsage();
    heapDelta += (after.heapUsed - before.heapUsed) / 1024 / 1024;
    externalDelta += (after.external - before.external) / 1024 / 1024;
    rssDelta += (after.rss - before.rss) / 1024 / 1024;
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
      (externalDelta / iterations).toFixed(1),
      (rssDelta / iterations).toFixed(1),
    ].join(","),
  );
}

/**
 * Measures post-GC heap/external growth while HOLDING a loaded em.find result.
 *
 * Runs in its own synchronous-measurement frame per iteration: stale V8 frame registers in an
 * async loop can pin the previous iteration's result and corrupt before/after deltas.
 */
async function measureRetained(size: number): Promise<void> {
  const { heapMb, externalMb } = await loadAndMeasure();
  console.log(`em_find_retained,1,0.0,0.0,0.0,${heapMb.toFixed(1)},${externalMb.toFixed(1)},0.0`);
  void size;
}

/** Loads all authors and returns the post-GC memory growth while the result is still alive. */
async function loadAndMeasure(): Promise<{ heapMb: number; externalMb: number }> {
  global.gc?.();
  const before = process.memoryUsage();
  const em = newEntityManager();
  const authors = await em.find(Author, {});
  global.gc?.();
  const after = process.memoryUsage();
  if (authors.length === 0) throw new Error("expected rows");
  return {
    heapMb: (after.heapUsed - before.heapUsed) / 1024 / 1024,
    externalMb: (after.external - before.external) / 1024 / 1024,
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

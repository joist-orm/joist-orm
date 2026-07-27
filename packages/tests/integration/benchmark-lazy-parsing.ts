import { getField, getMetadata, setDefaultEntityLimit } from "joist-orm";
import { performance } from "node:perf_hooks";
import { Author } from "./src/entities";
import { newEntityManager, pool, testDriver } from "./src/testEm";

/**
 * The overall before/after: classic eager rows vs lazy-parsing — the umbrella for lazy cell
 * decode + zero-copy socket buffers + binary result format — toggled by `JOIST_ROW_DATA`; run
 * once per mode and compare (see JS-ROW-STORE-DESIGN.md "Overall impact").
 *
 * Note "classic" is this branch with `lazyRows` off (the same wire/decode pipeline as joist
 * main), not a literal main checkout: both modes share the branch's non-lazy changes, so the
 * comparison isolates exactly the lazy-parsing work.
 *
 * Reads a 100k-row slice of the ~40-column authors table (13 columns populated, the rest NULL)
 * at three per-row access widths: 3 columns, 20 columns, and every serde-backed column, plus
 * the hydrate-only baseline and retained-memory-while-holding-the-result. All reads go through
 * `getField` so the only variable across scenarios is how many columns fault.
 *
 * Note this resets the shared test database (via flush_database) before and after.
 */
async function main(): Promise<void> {
  const size = 100_000;
  setDefaultEntityLimit(size + 1_000);
  const mode = process.env.JOIST_ROW_DATA === "1" ? "lazy-parsing" : "classic";
  console.log(`node=${process.version} exposeGc=${typeof global.gc === "function"} mode=${mode} size=${size}`);

  try {
    await pool.query("select flush_database()");
    await pool.query(`
      INSERT INTO authors (first_name, last_name, ssn, initials, number_of_books, age, is_funny,
        graduated, quotes, number_of_atoms, nick_names, address, created_at, updated_at)
      SELECT 'first' || i, 'last' || i, 'ssn' || i, 'fl', i % 17, 20 + (i % 60), i % 2 = 0,
        '2000-01-01'::date + (i % 9000), ('["quote ' || i || '"]')::jsonb, i::bigint * 1000000, array['nick' || i],
        '{"street": "123 Main"}'::jsonb, now(), now()
      FROM generate_series(1, ${size}) i
    `);

    const fields = Object.values(getMetadata(Author).allFields)
      .filter((f) => f.serde !== undefined)
      .map((f) => f.fieldName)
      .filter((name) => name !== "id");
    const read3 = ["firstName", "age", "isFunny"];
    const read20 = fields.slice(0, 20);
    console.log(`serde fields=${fields.length} read3=${read3.join("|")}`);

    console.log("scenario,iterations,mean_ms,min_ms,max_ms,heap_delta_mb,external_delta_mb,rss_delta_mb");
    await measureRetained();
    await measure("em_find_hydrate", 5, async () => {
      const em = newEntityManager();
      return (await em.find(Author, {})).length;
    });
    await measure("em_find_read_3", 5, () => findAndRead(read3));
    await measure("em_find_read_20", 4, () => findAndRead(read20));
    await measure(`em_find_read_${fields.length}`, 3, () => findAndRead(fields));
  } finally {
    await pool.query("select flush_database()").catch(() => {});
    await testDriver.destroy();
  }
}

/** Finds all authors and faults `fieldNames` on every entity, returning a checksum-ish count. */
async function findAndRead(fieldNames: string[]): Promise<number> {
  const em = newEntityManager();
  const authors = await em.find(Author, {});
  let checksum = 0;
  for (const author of authors) {
    for (const fieldName of fieldNames) {
      checksum += getField(author, fieldName) !== undefined ? 1 : 0;
    }
  }
  return checksum > 0 ? authors.length : 0;
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

/** Measures post-GC heap/external growth while HOLDING a loaded em.find result. */
async function measureRetained(): Promise<void> {
  global.gc?.();
  const before = process.memoryUsage();
  const em = newEntityManager();
  const authors = await em.find(Author, {});
  global.gc?.();
  const after = process.memoryUsage();
  if (authors.length === 0) throw new Error("expected rows");
  const heapMb = (after.heapUsed - before.heapUsed) / 1024 / 1024;
  const externalMb = (after.external - before.external) / 1024 / 1024;
  console.log(`em_find_retained,1,0.0,0.0,0.0,${heapMb.toFixed(1)},${externalMb.toFixed(1)},0.0`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

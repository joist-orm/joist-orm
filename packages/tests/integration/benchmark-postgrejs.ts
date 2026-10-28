import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";

import { type Driver, EntityManager, getField, getMetadata, setDefaultEntityLimit } from "joist-orm";
import { PostgresDriver } from "joist-orm/pg";
import { PostgreJsDriver } from "joist-orm/postgrejs";
import pg from "pg";
import { Pool } from "postgrejs";

import { JoistRowDecoder, PostgreJsPrototype } from "./postgrejs-prototype.ts";
import { Author, type AuthorId } from "./src/entities";

const url = process.env.DATABASE_URL ?? "postgres://joist:local@localhost:5435/joist_stock";
const sizes = (process.env.BENCH_SIZES ?? "1,100,10000,50000").split(",").map(Number);
const iterations = Number(process.env.BENCH_ITERATIONS ?? 7);
const allModes = ["pg-stock", "pg-wire", "postgrejs-eager", "postgrejs-lazy", "postgrejs-full-lazy"] as const;
type Mode = (typeof allModes)[number];
const modes = process.env.BENCH_MODES ? (process.env.BENCH_MODES.split(",") as Mode[]) : allModes;
for (const mode of modes) assert.ok(allModes.includes(mode), `Unknown benchmark mode: ${mode}`);
type Scenario = "hydrate" | "sparse" | "selective" | "full" | "reverse" | "identity";
type Measurement = {
  mode: Mode;
  size: number;
  scenario: Scenario;
  medianMs: number;
  p90Ms: number;
  samplesMs: number[];
  heapMb: number;
  externalMb: number;
};
type Result = { mode: Mode; checksum: string; measurements: Measurement[] };
const fields = Object.values(getMetadata(Author).allFields)
  .filter((field) => field.serde && field.fieldName !== "id")
  .map((field) => field.fieldName);

/**
 * Runs each driver against a private clone of the real integration fixture.
 *
 * Separate processes keep the lazy node-pg protocol patch out of the stock baseline.
 */
async function main(): Promise<void> {
  setDefaultEntityLimit(Math.max(...sizes) + 1000);
  if (process.argv[2] === "--child") {
    await child(process.argv[3] as Mode, process.argv[4], process.argv[5]);
    return;
  }
  const schema = `bench_postgrejs_${process.pid}`;
  const output = resolve(process.env.BENCH_OUTPUT ?? "../../../artifacts/postgrejs");
  mkdirSync(output, { recursive: true });
  const admin = new pg.Pool({ connectionString: url });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`CREATE TABLE ${schema}.authors (LIKE public.authors INCLUDING DEFAULTS INCLUDING CONSTRAINTS)`);
    await admin.query(
      `INSERT INTO ${schema}.authors
      (id, first_name, last_name, ssn, initials, number_of_books, age, is_funny,
       graduated, quotes, number_of_atoms, nick_names, address, created_at, updated_at)
      SELECT i, 'first-' || i || '-é雪', 'last-' || i, 'ssn-' || i, 'fl', i % 17,
        20 + i % 60, i % 2 = 0, '2000-01-01'::date + i % 9000,
        jsonb_build_array(repeat('quote-' || i, 20)), i::bigint * 1000000,
        array['nick-' || i, '雪'], jsonb_build_object('street', repeat('Main ', 30)),
        '2024-01-01T12:00:00Z'::timestamptz, '2024-01-01T12:00:00Z'::timestamptz
      FROM generate_series(1, $1) i`,
      [Math.max(...sizes)],
    );
    await admin.query(`ALTER TABLE ${schema}.authors ADD PRIMARY KEY (id)`);
    await admin.query(`ANALYZE ${schema}.authors`);
    const results: Result[] = [];
    for (const mode of modes) {
      const file = resolve(output, `${mode}.json`);
      const run = spawnSync(
        process.execPath,
        ["--expose-gc", "--import", "tsx", process.argv[1], "--child", mode, schema, file],
        {
          stdio: "inherit",
          env: { ...process.env, TZ: "UTC" },
        },
      );
      assert.equal(run.status, 0, `${mode} failed`);
      const result: Result = JSON.parse(readFileSync(file, "utf8"));
      if (results.length) assert.equal(result.checksum, results[0].checksum, `${mode} decoded different entity values`);
      results.push(result);
    }
    const metadata = {
      node: process.version,
      cpu: cpus()[0].model,
      postgres: (await admin.query("select version()")).rows[0].version,
      sizes,
      iterations,
      fields,
      pg: "8.23.0",
      postgrejs: "3.14.1",
      results,
    };
    writeFileSync(resolve(output, "results.json"), JSON.stringify(metadata, null, 2));
    console.log(`Parity checks passed for all ${fields.length} serde fields. Results: ${output}/results.json`);
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
}

/**
 * Validates public entity values and measures end-to-end finds plus field access.
 *
 * Each scenario warms its pool and JIT before measuring requests and retained memory separately.
 */
async function child(mode: Mode, schema: string, output: string): Promise<void> {
  const pgPool = new pg.Pool({ connectionString: url, max: 1, options: `-c search_path=${schema},public` });
  const parsed = new URL(url);
  const fullPool = new Pool({
    host: parsed.hostname,
    port: Number(parsed.port),
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.slice(1),
    schema,
    max: 1,
    timezone: "UTC",
    asyncErrorHandling: false,
  });
  const jsPool = new Pool({
    host: parsed.hostname,
    port: Number(parsed.port),
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.slice(1),
    schema,
    max: 1,
    asyncErrorHandling: false,
    // Match node-pg's unnamed statements rather than also measuring a prepared-statement cache.
    prepare: false,
  });
  const driver: Driver = mode.startsWith("pg-")
    ? new PostgresDriver(pgPool, { lazyRows: mode === "pg-wire" })
    : mode.startsWith("postgrejs-full-")
      ? new PostgreJsDriver(fullPool)
      : new PostgreJsPrototype(jsPool, mode === "postgrejs-lazy");
  try {
    await verifyRetainedEntities(driver);
    if (mode === "postgrejs-lazy") await verifyDecoder(jsPool);
    const sample = await find(driver, Math.min(100, Math.max(...sizes)));
    const values = sample.map((author) => fields.map((field) => getField(author, field)));
    const checksum = createHash("sha256")
      .update(JSON.stringify(values, (_key, value) => (typeof value === "bigint" ? `${value}n` : value)))
      .digest("hex");
    const measurements: Measurement[] = [];
    console.log(`\n${mode}: ${fields.length} fields; scenario,size,median_ms,p90_ms,heap_mb,external_mb`);
    for (const size of sizes) {
      for (const scenario of ["hydrate", "sparse", "selective", "full", "reverse", "identity"] as const) {
        for (let i = 0; i < 3; i++) await exercise(driver, size, scenario);
        const samplesMs = await timeScenario(driver, size, scenario);
        const memory = await retainedMemory(driver, size, scenario);
        const sorted = [...samplesMs].sort((a, b) => a - b);
        const result = {
          mode,
          size,
          scenario,
          samplesMs,
          medianMs: sorted[Math.floor(sorted.length / 2)],
          p90Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))],
          ...memory,
        };
        measurements.push(result);
        console.log(
          `${scenario},${size},${result.medianMs.toFixed(2)},${result.p90Ms.toFixed(2)},${result.heapMb.toFixed(2)},${result.externalMb.toFixed(2)}`,
        );
      }
    }
    writeFileSync(output, JSON.stringify({ mode, checksum, measurements }, null, 2));
  } finally {
    await pgPool.end();
    await jsPool.close();
    await fullPool.close();
  }
}

/** Releases each timed result before the separate retained-memory measurement. */
async function timeScenario(driver: Driver, size: number, scenario: Scenario): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    global.gc!();
    samples.push(await timeOnce(driver, size, scenario));
  }
  return samples;
}

/** Keeps the previous iteration's entities out of scope before the next forced GC. */
async function timeOnce(driver: Driver, size: number, scenario: Scenario): Promise<number> {
  const start = performance.now();
  const authors = await exercise(driver, size, scenario);
  const elapsed = performance.now() - start;
  assert.equal(authors.length, size);
  return elapsed;
}

/** Keeps entities alive through GC, with no previous scenario's result in the caller's scope. */
async function retainedMemory(driver: Driver, size: number, scenario: Scenario) {
  global.gc!();
  global.gc!();
  const before = process.memoryUsage();
  const held = await exercise(driver, size, scenario);
  global.gc!();
  global.gc!();
  const after = process.memoryUsage();
  assert.equal(held.length, size);
  assert.equal(held[0].firstName, "first-1-é雪");
  return {
    heapMb: (after.heapUsed - before.heapUsed) / 2 ** 20,
    externalMb: (after.external - before.external) / 2 ** 20,
  };
}

/** Uses a fresh identity map for each request, without pagination (which deliberately bypasses lazy rows). */
async function find(driver: Driver, size: number, em = new EntityManager({}, { driver })): Promise<Author[]> {
  return em.find(Author, { id: { lte: `a:${size}` as AuthorId } }, { orderBy: { id: "ASC" } });
}

/**
 * Exercises sparse business logic, dense faults in both orders, and duplicate identity-map hits.
 *
 * All requests select the same columns; only application-side access changes between scenarios.
 */
async function exercise(driver: Driver, size: number, scenario: Scenario): Promise<Author[]> {
  const em = new EntityManager({}, { driver });
  const authors = await find(driver, size, em);
  if (scenario === "identity") {
    // A distinct filter avoids Joist's find-result cache while returning the same entities.
    const again = await em.find(
      Author,
      { id: { gte: "a:1" as AuthorId, lte: `a:${size}` as AuthorId } },
      { orderBy: { id: "ASC" } },
    );
    assert.equal(again[0], authors[0]);
    // The first result must survive finalization of the duplicate query.
    assert.equal(again[0].firstName, "first-1-é雪");
  }
  const names =
    scenario === "sparse"
      ? ["firstName", "age", "isFunny"]
      : scenario === "full"
        ? fields
        : scenario === "reverse"
          ? [...fields].reverse()
          : [];
  for (const author of authors) {
    for (const name of names) getField(author, name);
    if (scenario === "selective" && author.age! % 10 === 0) {
      getField(author, "quotes");
      getField(author, "address");
    }
  }
  return authors;
}

/** Validates mixed identity-map hits and new rows, including delayed faults after another query. */
async function verifyRetainedEntities(driver: Driver): Promise<void> {
  // Given most authors are already loaded in this request
  const size = Math.min(100, Math.max(...sizes));
  const em = new EntityManager({}, { driver });
  const existing = await find(driver, Math.max(1, size - 1), em);
  // When a wider find keeps only its new author and another query reuses the connection
  const all = await find(driver, size, em);
  await find(driver, size);
  // Then both old and newly retained entities still decode every field correctly
  assert.equal(all[0], existing[0]);
  const expected = await find(driver, size);
  assert.deepEqual(
    all.map((a) => fields.map((f) => getField(a, f))),
    expected.map((a) => fields.map((f) => getField(a, f))),
  );
}

/** Checks public raw-row decoding and compaction against PostgreJS's own eager parser on real rows. */
async function verifyDecoder(pool: Pool): Promise<void> {
  // Given actual binary rows with scalar, JSON, array, date, unicode and null fields
  const sql = "select * from authors order by id limit 100";
  const eager = await pool.query(sql, { rowDecoder: "object" });
  const decoder = new JoistRowDecoder();
  await pool.query(sql, { rowDecoder: decoder });
  // When every cell is materialized through the headerless wire-row path
  const rows = decoder.rows.toRows();
  // Then decoding matches the driver's eager parser
  assert.deepEqual(rows, eager.rows);
  // When only the last row survives hydration and later socket reads occur
  const last = decoder.rows.rowCount - 1;
  decoder.rows.retain(last);
  decoder.rows.finalize();
  await pool.query(sql);
  // Then compaction preserves row indices and delayed values
  assert.deepEqual(decoder.rows.toRow(last), eager.rows![last]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

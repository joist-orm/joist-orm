import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { type Driver, EntityManager } from "joist-orm";
import { PostgresDriver, createPostgreJsPool } from "joist-orm/pg";
import pg from "pg";

import { Author, type AuthorId } from "./src/entities";

const source = process.env.DATABASE_URL ?? "postgres://joist:local@localhost:5435/joist_stock";
const size = Number(process.env.BENCH_WRITE_SIZE ?? 100);
const iterations = Number(process.env.BENCH_ITERATIONS ?? 15);
const modes = ["pg-stock", "pg-wire", "postgrejs-full-eager", "postgrejs-full-lazy"] as const;
type Mode = (typeof modes)[number];
type Scenario = "insert" | "load-update" | "transaction-cycle";

/**
 * Benchmarks complete ORM writes in a disposable clone of the integration database.
 *
 * Cloning keeps real sequences, native enums, triggers and unnest_arrays, while isolating
 * resets and committed writes from every test fixture and application database.
 */
async function main(): Promise<void> {
  if (process.argv[2] === "--child") {
    await child(process.argv[3] as Mode, process.argv[4], process.argv[5]);
    return;
  }
  const database = `joist_postgrejs_bench_${process.pid}`;
  const url = new URL(source);
  const template = url.pathname.slice(1);
  const admin = new pg.Pool({
    connectionString: process.env.BENCH_ADMIN_URL ?? "postgres://postgres:admin@localhost:5435/postgres",
  });
  const output = resolve(process.env.BENCH_OUTPUT ?? "../../../artifacts/postgrejs-writes");
  mkdirSync(output, { recursive: true });
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${database} TEMPLATE "${template.replaceAll('"', '""')}"`);
    created = true;
    url.pathname = `/${database}`;
    const results = [];
    for (const mode of modes) {
      const file = resolve(output, `${mode}.json`);
      const run = spawnSync(
        process.execPath,
        ["--expose-gc", "--import", "tsx", process.argv[1], "--child", mode, url.toString(), file],
        {
          stdio: "inherit",
          env: { ...process.env, TZ: "UTC", JOIST_LAZY_BINARY: "1" },
        },
      );
      assert.equal(run.status, 0, `${mode} failed`);
      results.push(JSON.parse(readFileSync(file, "utf8")));
    }
    writeFileSync(
      resolve(output, "results.json"),
      JSON.stringify({ node: process.version, size, iterations, results }, null, 2),
    );
  } finally {
    if (created) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
    await admin.end();
  }
}

/** Measures warmed requests with fresh identity maps and checks persisted effects outside the timer. */
async function child(mode: Mode, url: string, output: string): Promise<void> {
  const config = { connectionString: url, max: 4 };
  const pool = mode.startsWith("pg-") ? new pg.Pool(config) : createPostgreJsPool(config);
  const driver = new PostgresDriver(pool, { lazyRows: mode === "pg-wire" || mode === "postgrejs-full-lazy" });
  const samples = [];
  try {
    await pool.query("select flush_database()");
    await pool.query(
      `insert into authors (first_name, initials, number_of_books, age, created_at, updated_at)
      select 'seed-' || i, 'se', 0, 40, now(), now() from generate_series(1, $1) i`,
      [size],
    );
    for (const scenario of ["insert", "load-update", "transaction-cycle"] as const) {
      for (let i = 0; i < 3; i++) {
        await exercise(driver, scenario, i);
        await pool.query("delete from authors where id > $1", [size]);
      }
      const times = [];
      for (let i = 0; i < iterations; i++) {
        global.gc!();
        times.push(await timeOnce(driver, scenario, i));
        const expected = scenario === "insert" ? size * 2 : size;
        assert.equal(Number((await pool.query("select count(*) from authors")).rows[0].count), expected);
        if (scenario === "load-update") {
          const renamed = await pool.query("select count(*) from authors where id <= $1 and first_name = $2", [
            size,
            `updated-${i}`,
          ]);
          assert.equal(Number(renamed.rows[0].count), size);
        }
        await pool.query("delete from authors where id > $1", [size]);
      }
      const sorted = [...times].sort((a, b) => a - b);
      const result = {
        scenario,
        medianMs: sorted[Math.floor(sorted.length / 2)],
        p90Ms: sorted[Math.floor(sorted.length * 0.9)],
        samplesMs: times,
      };
      samples.push(result);
      console.log(`${mode},${scenario},${size},${result.medianMs.toFixed(2)},${result.p90Ms.toFixed(2)}`);
    }
    writeFileSync(output, JSON.stringify({ mode, samples }, null, 2));
  } finally {
    await pool.end();
  }
}

/** Holds only timing data between requests, so GC can reclaim the previous identity map. */
async function timeOnce(driver: Driver, scenario: Scenario, iteration: number): Promise<number> {
  const start = performance.now();
  await exercise(driver, scenario, iteration);
  return performance.now() - start;
}

/** Exercises bulk writes, a read/modify/write request, and three flushes in one transaction. */
async function exercise(driver: Driver, scenario: Scenario, iteration: number): Promise<void> {
  // The fixture's beforeFlush hook calls a fake external API, just as in its test context.
  const em = new EntityManager({ makeApiCall: async () => {} }, { driver });
  if (scenario === "load-update") {
    const authors = await em.find(Author, { id: { lte: `a:${size}` as AuthorId } });
    assert.equal(authors.length, size);
    for (const author of authors) author.firstName = `updated-${iteration}`;
    await em.flush();
  } else if (scenario === "insert") {
    createAuthors(em);
    await em.flush();
  } else {
    await em.transaction(async () => {
      const authors = createAuthors(em);
      await em.flush();
      for (const author of authors) author.firstName = "updated";
      await em.flush();
      for (const author of authors) em.delete(author);
      await em.flush();
    });
  }
}

/** Uses real entity validation, defaults, hooks, ID assignment and bulk SQL generation. */
function createAuthors(em: EntityManager): Author[] {
  return Array.from({ length: size }, (_, i) => em.create(Author, { firstName: `bench-${i}`, age: 40 }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

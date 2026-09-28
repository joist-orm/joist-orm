import { createKnex } from "joist-orm/knex";
import { PostgresDriver, PostgresDriverOpts } from "joist-orm/pg";
import { toMatchEntity } from "joist-test-utils";
import { newPgConnectionConfig } from "joist-utils";
import { Knex } from "knex";
import pg from "pg";
import { EntityManager } from "src/entities";
import { afterAll, beforeAll, beforeEach, expect } from "vitest";

expect.extend({ toMatchEntity });

// Shared across the suite; a single pool/knex, a fresh EntityManager per test.
export let knex: Knex;
let pool: pg.Pool;

/** Creates a new `EntityManager` for the current test, reusing the shared pool. */
export function newEntityManager(opts?: PostgresDriverOpts): EntityManager {
  const ctx = { knex };
  const em = new EntityManager(ctx as any, new PostgresDriver(pool, opts));
  Object.assign(ctx, { em });
  return em;
}

beforeAll(async () => {
  pool = new pg.Pool(newPgConnectionConfig());
  knex = createKnex(pool);
});

beforeEach(async () => {
  await knex.select(knex.raw("flush_database()"));
});

afterAll(async () => {
  await pool.end();
});

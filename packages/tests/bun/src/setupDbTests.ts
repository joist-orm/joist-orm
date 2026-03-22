import { afterAll, beforeEach, expect } from "bun:test";
import { newPgConnectionConfig } from "joist-orm";
import { createKnex } from "joist-orm/knex";
import { PostgresDriver } from "joist-orm/pg";
import { toMatchEntity } from "joist-test-utils";
import { Knex } from "knex";
import pg from "pg";
import { EntityManager } from "src/entities";

expect.extend({ toMatchEntity });

const pool = new pg.Pool(newPgConnectionConfig());
export let knex: Knex = createKnex(pool);

export function newEntityManager(): EntityManager {
  const ctx = { knex };
  const em = new EntityManager(ctx as any, {
    driver: new PostgresDriver(pool),
  });
  Object.assign(ctx, { em });
  return em;
}

beforeEach(async () => {
  await knex.select(knex.raw("flush_database()"));
});

afterAll(async () => {
  // This runs once per test file, so we cannot destroy or it will break everything after the
  // first test. Oddly enough the process still seems to shutdown cleanly.
  // await pool.end();
});

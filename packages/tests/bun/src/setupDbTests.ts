import { afterAll, beforeEach, expect } from "bun:test";
import { newPgConnectionConfig } from "joist-orm";
import { PostgresDriver } from "joist-orm/pg";
import { toMatchEntity } from "joist-test-utils";
import { knex as createKnex, Knex } from "knex";
import pg from "pg";
import { EntityManager } from "src/entities";

expect.extend({ toMatchEntity });

const connectionConfig = newPgConnectionConfig() as any;
const pool = new pg.Pool(connectionConfig);

export let knex: Knex = createKnex({
  client: "pg",
  connection: connectionConfig,
  asyncStackTraces: true,
});

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
  // await knex.destroy();
});

import { afterAll, beforeEach, expect } from "bun:test";
import { newPgConnectionConfig } from "joist-orm";
import { PostgresDriver } from "joist-orm/pg";
import { toMatchEntity } from "joist-test-utils";
import { knex as createKnex, Knex } from "knex";
import { EntityManager } from "src/entities";

expect.extend({ toMatchEntity });

export let knex: Knex = createKnex({
  client: "pg",
  connection: newPgConnectionConfig() as any,
  asyncStackTraces: true,
});

export function newEntityManager(): EntityManager {
  const ctx = { knex };
  const em = new EntityManager(ctx as any, {
    driver: new PostgresDriver(knex),
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
  // await knex.destroy();
});

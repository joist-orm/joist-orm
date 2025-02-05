import { afterAll, beforeEach, expect } from "@jest/globals";
import { newPgConnectionConfig, PostgresDriver } from "joist-orm";
import { toMatchEntity } from "joist-test-utils";
import { knex as createKnex, Knex } from "knex";
import { EntityManager } from "src/entities/index.ts";

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
  await knex.destroy();
});

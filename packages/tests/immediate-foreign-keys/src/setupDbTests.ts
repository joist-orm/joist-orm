import { EntityManager } from "@src/entities";
import { PostgresDriver, PostgresDriverOpts } from "joist-orm";
import { toMatchEntity } from "joist-test-utils";
import { newPgConnectionConfig } from "joist-utils";
import { Knex, knex as createKnex } from "knex";

// Create a shared test context that tests can use and also we'll use to auto-flush the db between tests.
export let knex: Knex;

export function newEntityManager(opts?: PostgresDriverOpts): EntityManager {
  const ctx = { knex };
  const em = new EntityManager(ctx as any, new PostgresDriver(knex, opts));
  Object.assign(ctx, { em });
  return em;
}

export let numberOfQueries = 0;
export let queries: string[] = [];

expect.extend({ toMatchEntity });

beforeAll(async () => {
  knex = createKnex({
    client: "pg",
    connection: newPgConnectionConfig(),
    debug: false,
    asyncStackTraces: true,
  }).on("query", (e: any) => {
    numberOfQueries++;
    queries.push(e.sql);
  });
});

beforeEach(async () => {
  await knex.select(knex.raw("flush_database()"));
  resetQueryCount();
});

afterAll(async () => {
  await knex.destroy();
});

export function select(tableName: string): Promise<readonly any[]> {
  return knex.select("*").from(tableName).orderBy("id");
}

export function resetQueryCount() {
  numberOfQueries = 0;
  queries = [];
}

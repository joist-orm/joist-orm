import { EntityManager } from "@src/entities";
import { PostgresDriver, PostgresDriverOpts } from "joist-orm/pg";
import { toMatchEntity } from "joist-test-utils";
import { newPgConnectionConfig } from "joist-utils";
import { createKnex } from "joist-orm/knex";
import { Knex } from "knex";
import pg from "pg";

// Create a shared test context that tests can use and also we'll use to auto-flush the db between tests.
export let knex: Knex;
let pool: pg.Pool;

export function newEntityManager(opts?: PostgresDriverOpts): EntityManager {
  const ctx = { knex };
  const em = new EntityManager(
    ctx as any,
    new PostgresDriver(pool, {
      ...opts,
      onQuery: (sql) => {
        numberOfQueries++;
        queries.push(sql);
      },
    }),
  );
  Object.assign(ctx, { em });
  return em;
}

export let numberOfQueries = 0;
export let queries: string[] = [];

expect.extend({ toMatchEntity });

beforeAll(async () => {
  pool = new pg.Pool(newPgConnectionConfig());
  knex = createKnex(pool).on("query", (e: any) => {
    numberOfQueries++;
    queries.push(e.sql);
  });
});

beforeEach(async () => {
  await knex.select(knex.raw("flush_database()"));
  resetQueryCount();
});

afterAll(async () => {
  await pool.end();
});

export function select(tableName: string): Promise<readonly any[]> {
  return knex.select("*").from(tableName).orderBy("id");
}

export function resetQueryCount() {
  numberOfQueries = 0;
  queries = [];
}

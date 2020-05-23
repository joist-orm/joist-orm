import Knex from "knex";
import { config } from "dotenv";
import { newPgConnectionConfig } from "joist-utils";

if (process.env.DATABASE_CONNECTION_INFO === undefined) {
  config({ path: "./local.env" });
}

// Create a shared test context that tests can use and also we'll use to auto-flush the db between tests.
export let knex: Knex;

export let numberOfQueries = 0;
export let queries: string[] = [];

beforeAll(async () => {
  knex = Knex({
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

export function resetQueryCount() {
  numberOfQueries = 0;
  queries = [];
}

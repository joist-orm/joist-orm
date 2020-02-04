// Create a shared test context that tests can use and also we'll use to auto-flush the db between tests.

import Knex from "knex";

export let knex: Knex;

export let numberOfQueries = 0;

beforeAll(async () => {
  knex = Knex({
    client: "pg",
    connection: {
      host: "127.0.0.1",
      port: 5435,
      user: "joist",
      password: "local",
      database: "joist",
    },
  }).on("query", () => numberOfQueries++);
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
}

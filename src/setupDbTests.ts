// Create a shared test context that tests can use and also we'll use to auto-flush the db between tests.

import Knex from "knex";

export let knex: Knex;

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
  });
});

beforeEach(async () => {
  await knex.select(knex.raw("flush_database()"));
});

afterAll(async () => {
  await knex.destroy();
});

import Knex from "knex";

// Create a shared test context that tests can use and also we'll use to auto-flush the db between tests.
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
    debug: false,
    asyncStackTraces: true,
  }).on("query", () => {
    numberOfQueries++;
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
}

import { EntityManager } from "@src/entities";
import { config } from "dotenv";
import { newPgConnectionConfig } from "joist-utils";
import Knex from "knex";
import { Context } from "@src/context";

if (process.env.DATABASE_CONNECTION_INFO === undefined) {
  config({ path: "./local.env" });
}

// Create a shared test context that tests can use and also we'll use to auto-flush the db between tests.
export let knex: Knex;
export const makeApiCall = jest.fn();

export function newEntityManager() {
  const ctx = { knex };
  const em = new EntityManager(ctx as any);
  Object.assign(ctx, { em, makeApiCall });
  return em;
}

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

type itWithCtxFn = (ctx: Context) => Promise<void>;
it.withCtx = (name: string, fnOrOpts: itWithCtxFn | ContextOpts, maybeFn?: itWithCtxFn) => {
  const fn: itWithCtxFn = typeof fnOrOpts === "function" ? fnOrOpts : maybeFn!;
  const opts: ContextOpts = typeof fnOrOpts === "function" ? {} : fnOrOpts;
  it(name, async () => fn({ em: newEntityManager(), knex, makeApiCall: async () => {} }));
};

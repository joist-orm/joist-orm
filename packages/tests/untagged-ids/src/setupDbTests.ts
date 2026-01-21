import { Context } from "@src/context";
import { EntityManager } from "@src/entities";
import { TestUuidAssigner } from "joist-orm";
import { PostgresDriver, PostgresDriverOpts } from "joist-orm/pg";
import { toMatchEntity } from "joist-test-utils";
import { newPgConnectionConfig } from "joist-utils";
import { Knex, knex as createKnex } from "knex";

// Create a shared test context that tests can use and also we'll use to auto-flush the db between tests.
export let knex: Knex;

const testUuidAssigner = new TestUuidAssigner();

beforeEach(() => testUuidAssigner.reset());

export function newEntityManager(opts?: PostgresDriverOpts) {
  const ctx = { knex };
  const em = new EntityManager(
    ctx as any,
    new PostgresDriver(knex, {
      idAssigner: testUuidAssigner,
      ...opts,
    }),
  );
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

export function resetQueryCount() {
  numberOfQueries = 0;
  queries = [];
}

type itWithCtxFn = (ctx: Context) => Promise<void>;
it.withCtx = (name: string, fnOrOpts: itWithCtxFn | ContextOpts, maybeFn?: itWithCtxFn) => {
  const fn: itWithCtxFn = typeof fnOrOpts === "function" ? fnOrOpts : maybeFn!;
  it(name, async () => fn({ em: newEntityManager(), knex }));
};

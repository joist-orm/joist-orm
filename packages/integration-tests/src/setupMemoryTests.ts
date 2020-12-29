import { Context } from "@src/context";
import { EntityManager } from "@src/entities";
import { config } from "dotenv";
import { InMemoryDriver } from "joist-orm";

if (process.env.DATABASE_CONNECTION_INFO === undefined) {
  config({ path: "./local.env" });
}

// Create a shared test context that tests can use and also we'll use to auto-flush the db between tests.
export let driver: InMemoryDriver;
export const makeApiCall = jest.fn();

export function newEntityManager() {
  const ctx = { knex: undefined };
  const em = new EntityManager(ctx as any, driver);
  Object.assign(ctx, { em, makeApiCall });
  return em;
}

beforeAll(async () => {
  driver = new InMemoryDriver();
});

beforeEach(async () => {
  driver.clear();
});

type itWithCtxFn = (ctx: Context) => Promise<void>;
it.withMemoryCtx = (name: string, fnOrOpts: itWithCtxFn | ContextOpts, maybeFn?: itWithCtxFn) => {
  const fn: itWithCtxFn = typeof fnOrOpts === "function" ? fnOrOpts : maybeFn!;
  it(name, async () => fn({ em: newEntityManager(), knex: undefined!, makeApiCall: async () => {} }));
};

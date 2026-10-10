import { expect } from "@jest/globals";
import { Temporal } from "joist-orm";
import { createKnex } from "joist-orm/knex";
import { PostgresDriver, PostgresDriverOpts } from "joist-orm/pg";
import { toMatchEntity } from "joist-test-utils";
import { newPgConnectionConfig } from "joist-utils";
import { Knex } from "knex";
import pg from "pg";
import { Context } from "src/context";
import { EntityManager } from "src/entities";

// Create a shared test context that tests can use and also we'll use to auto-flush the db between tests.
export let knex: Knex;
export let pool: pg.Pool;

export function newEntityManager(opts?: PostgresDriverOpts) {
  const ctx = { knex };
  const em = new EntityManager(
    ctx as any,
    new PostgresDriver(pool, {
      lazyRows: process.env.JOIST_ROW_DATA === "1",
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

export function resetQueryCount() {
  numberOfQueries = 0;
  queries = [];
}

type itWithCtxFn = (ctx: Context) => Promise<void>;
it.withCtx = (name: string, fnOrOpts: itWithCtxFn | ContextOpts, maybeFn?: itWithCtxFn) => {
  const fn: itWithCtxFn = typeof fnOrOpts === "function" ? fnOrOpts : maybeFn!;
  it(name, async () => fn({ em: newEntityManager(), knex }));
};

export function areTemporalsEqual(a: unknown, b: unknown) {
  const aTag = Object.prototype.toString.call(a);
  const bTag = Object.prototype.toString.call(b);
  if (aTag === "[object Temporal.ZonedDateTime]" && bTag === aTag) {
    return (a as Temporal.ZonedDateTime).equals(b as Temporal.ZonedDateTime);
  }
  if (aTag === "[object Temporal.PlainDateTime]" && bTag === aTag) {
    return (a as Temporal.PlainDateTime).equals(b as Temporal.PlainDateTime);
  }
  if (aTag === "[object Temporal.PlainDate]" && bTag === aTag) {
    return (a as Temporal.PlainDate).equals(b as Temporal.PlainDate);
  }
  return undefined;
}

expect.addEqualityTesters([areTemporalsEqual]);

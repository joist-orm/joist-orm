import { EntityManager } from "@src/entities";
import { InMemoryTestDriver, PostgresTestDriver, TestDriver } from "@src/testDrivers";
import { EntityManagerOpts, ParsedFindQuery } from "joist-orm";
import { JsonAggregatePreloader } from "joist-plugin-join-preloading";
import { Knex } from "knex";

// Eventually set this via an env flag for dual CI builds, but for now just hard-coding
export const inMemory = false;

// Create a shared test context that tests can use, and also we'll use to auto-flush the db between tests.
export let testDriver: TestDriver = inMemory ? new InMemoryTestDriver() : new PostgresTestDriver();
export let knex: Knex = testDriver.knex;
export let numberOfQueries = 0;
export let queries: string[] = [];
export let finds: ParsedFindQuery[] = [];
const plugins = (process.env.PLUGINS ?? "join-preloading").split(",");
export const isPreloadingEnabled = plugins.includes("join-preloading");

let makeApiCall: Function = null!;

export function newEntityManager(opts?: Partial<EntityManagerOpts>): EntityManager {
  const ctx = { knex };
  const em = new EntityManager(ctx as any, {
    driver: testDriver.driver,
    preloadPlugin: isPreloadingEnabled ? new JsonAggregatePreloader() : undefined,
    ...opts,
  });
  Object.assign(ctx, { em, makeApiCall });
  return em;
}

export function resetQueryCount() {
  numberOfQueries = 0;
  queries = [];
  finds = [];
}

export function recordQuery(sql: string): void {
  numberOfQueries++;
  queries.push(sql);
}

export function recordFind(query: ParsedFindQuery): void {
  finds.push(query);
}

export function lastQuery(): string {
  return queries[queries.length - 1];
}

export function setApiCallMock(fn: Function) {
  makeApiCall = fn;
}

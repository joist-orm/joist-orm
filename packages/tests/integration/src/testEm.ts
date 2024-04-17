import { EntityManager } from "@src/entities";
import { PostgresTestDriver, TestDriver } from "@src/testDrivers";
import { EntityManagerOpts } from "joist-orm";
import { JsonAggregatePreloader } from "joist-plugin-join-preloading";
import { Knex } from "knex";

// Create a shared test context that tests can use, and also we'll use to auto-flush the db between tests.
export let testDriver: TestDriver = new PostgresTestDriver();
export let knex: Knex = testDriver.knex;
export let numberOfQueries = 0;
export let queries: string[] = [];
const plugins = (process.env.PLUGINS ?? "").split(",");
export const isPreloadingEnabled = plugins.includes("join-preloading");

let makeApiCall: Function = null!;

export function newEntityManager(): EntityManager {
  const ctx = { knex };
  const opts: EntityManagerOpts = {
    driver: testDriver.driver,
    preloadPlugin: isPreloadingEnabled ? new JsonAggregatePreloader() : undefined,
  };
  const em = new EntityManager(ctx as any, opts);
  Object.assign(ctx, { em, makeApiCall });
  return em;
}

export function resetQueryCount() {
  numberOfQueries = 0;
  queries = [];
}

export function recordQuery(sql: string): void {
  numberOfQueries++;
  queries.push(sql);
}

export function lastQuery(): string {
  return queries[queries.length - 1];
}

export function setApiCallMock(fn: Function) {
  makeApiCall = fn;
}

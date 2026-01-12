import { type EntityManagerOpts } from "joist-orm";
import { type Sql } from "postgres";
import { EntityManager } from "src/entities/index.js";
import { PostgresTestDriver, type TestDriver } from "src/testDrivers.js";

// Create a shared test context that tests can use, and also we'll use to auto-flush the db between tests.
const plugins = (process.env.PLUGINS ?? "join-preloading").split(",");
export const isPreloadingEnabled = plugins.includes("join-preloading");
export let testDriver: TestDriver = new PostgresTestDriver(isPreloadingEnabled);
export let sql: Sql = testDriver.sql;
export let numberOfQueries = 0;
export let queries: string[] = [];

let makeApiCall: Function = null!;

export function newEntityManager(): EntityManager {
  const ctx = { sql };
  const opts: EntityManagerOpts<any> = { driver: testDriver.driver };
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

import type { EntityManagerOpts } from "joist-orm";
import type { Knex } from "knex";
import type { Pool } from "pg";
import { EntityManager } from "src/entities";
import { PostgresTestDriver, type TestDriver } from "src/testDrivers";

import { SqliteTestDriver } from "../sqlite/SqliteTestDriver";

// Create a shared test context that tests can use, and also we'll use to auto-flush the db between tests.
const plugins = (process.env.PLUGINS ?? "join-preloading").split(",");
export const isSqlite = process.env.TEST_DRIVER === "sqlite";
export const isPreloadingEnabled = !isSqlite && plugins.includes("join-preloading");
export let numberOfQueries = 0;
export let queries: string[] = [];
export const testDriver: TestDriver = createTestDriver();
export const knex: Knex = testDriver.knex;

let makeApiCall: Function = null!;

export function newEntityManager(): EntityManager {
  const ctx = { knex };
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
  // console.log(sql);
  queries.push(sql);
}

export function lastQuery(): string {
  return queries[queries.length - 1];
}

export function setApiCallMock(fn: Function) {
  makeApiCall = fn;
}

/** Gives PostgreSQL-specific tests access to their native pool without requiring one of every driver. */
export function getPostgresPool(): Pool {
  if (!(testDriver instanceof PostgresTestDriver)) throw new Error("This test requires the PostgreSQL pool");
  return testDriver.pool;
}

/** Selects the backend once per Jest environment, keeping SQLite opt-in. */
function createTestDriver(): TestDriver {
  const backend = process.env.TEST_DRIVER ?? "postgres";
  if (backend === "sqlite") return new SqliteTestDriver();
  if (backend === "postgres") return new PostgresTestDriver(isPreloadingEnabled);
  throw new Error(`Unknown TEST_DRIVER: ${backend}`);
}

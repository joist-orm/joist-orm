import { EntityManager } from "@src/entities";
import { InMemoryTestDriver, PostgresTestDriver, TestDriver } from "@src/testDrivers";
import { afterAll, beforeAll, beforeEach } from "bun:test";
import { Driver } from "joist-orm";
import { Knex } from "knex";

// Eventually set this via an env flag for dual CI builds, but for now just hard-coding
export const inMemory = false;

// Create a shared test context that tests can use, and also we'll use to auto-flush the db between tests.
export let testDriver: TestDriver;
export let driver: Driver;
export let knex: Knex;
export const makeApiCall = () => {}; // jest.fn();
export let numberOfQueries = 0;
export let queries: string[] = [];

export function newEntityManager() {
  const ctx = { knex };
  const em = new EntityManager(ctx as any, driver);
  Object.assign(ctx, { em, makeApiCall });
  return em;
}

// expect.extend({ toMatchEntity });

beforeAll(async () => {
  testDriver = inMemory ? new InMemoryTestDriver() : new PostgresTestDriver();
  driver = testDriver.driver;
  knex = testDriver.knex;
});

beforeEach(async () => {
  await testDriver.beforeEach();
  resetQueryCount();
});

afterAll(async () => {
  await testDriver.destroy();
});

export function resetQueryCount() {
  numberOfQueries = 0;
  queries = [];
}

export function recordQuery(sql: string): void {
  numberOfQueries++;
  queries.push(sql);
}

export function maybeBeginAndCommit(): number {
  // the in-memory driver doesn't issue BEGIN or COMMIT queries, so
  // the query count will be lower by two than the real pg driver
  return testDriver.isInMemory ? 0 : 2;
}

export function lastQuery(): string {
  return queries[queries.length - 1];
}

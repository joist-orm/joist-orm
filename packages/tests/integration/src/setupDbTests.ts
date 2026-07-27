import { expect } from "@jest/globals";
import { binaryTextParser, setBinaryTypeParser } from "joist-orm/pg";
import { areEntitiesEqual, toMatchEntity } from "joist-test-utils";
import { pool, resetQueryCount, setApiCallMock, testDriver } from "src/testEm";

export const makeApiCall = jest.fn();

expect.extend({ toMatchEntity });
expect.addEqualityTesters([areEntitiesEqual]);

beforeAll(async () => {
  // Our schema has text-like types with database-assigned oids (citext, the favorite_shape
  // native enum), which lazy binary queries require explicit binary parsers for
  if (!testDriver.isInMemory) {
    const { rows } = await pool.query(`select oid from pg_type where typname in ('citext', 'favorite_shape')`);
    for (const row of rows) setBinaryTypeParser(Number(row.oid), binaryTextParser);
  }
});

beforeEach(async () => {
  setApiCallMock(makeApiCall);
  await testDriver.beforeEach();
  resetQueryCount();
});

afterAll(async () => {
  await testDriver.destroy();
});

export function maybeBeginAndCommit(): number {
  // the in-memory driver doesn't issue BEGIN or COMMIT queries, so
  // the query count will be lower by two than the real pg driver
  return testDriver.isInMemory ? 0 : 2;
}

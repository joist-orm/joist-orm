import { afterAll, beforeEach, expect, jest } from "@jest/globals";
import { areEntitiesEqual, toMatchEntity } from "joist-test-utils";
import { resetQueryCount, setApiCallMock, testDriver } from "src/testEm.js";

export const makeApiCall = jest.fn();

expect.extend({ toMatchEntity });
expect.addEqualityTesters([areEntitiesEqual]);

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

import { expect } from "@jest/globals";
import { resetQueryCount, setApiCallMock, testDriver } from "@src/testEm";
import { preventEqualsOnEntities, toBeEntities, toBeEntity, toMatchEntity } from "joist-test-utils";

export const makeApiCall = jest.fn();

expect.extend({ toMatchEntity, toBeEntity, toBeEntities });
expect.addEqualityTesters([preventEqualsOnEntities]);

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

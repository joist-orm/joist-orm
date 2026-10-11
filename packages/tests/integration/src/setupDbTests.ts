import { expect } from "@jest/globals";
import { areEntitiesEqual, toMatchEntity } from "joist-test-utils";
import { resetQueryCount, setApiCallMock, testDriver } from "src/testEm";

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
  // Both real database drivers issue BEGIN and COMMIT around a flush.
  return 2;
}

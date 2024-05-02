import { BaseEntity } from "joist-orm";
import { MatchedEntity } from "./toMatchEntity";
export { Context } from "./context";
export { ContextFn, makeRun, makeRunEach, newContext, run, runEach } from "./run";
export { seed } from "./seed";
export { toMatchEntity } from "./toMatchEntity";

declare global {
  namespace jest {
    interface Matchers<R, T = {}> {
      toMatchEntity(expected: MatchedEntity<T>): CustomMatcherResult;
    }
  }
}

/**
 * A custom equality tester for Jest, i.e. install it like:
 *
 * ```
 * import { expect } from "@jest/globals";
 * expect.addEqualityTesters([areEntitiesEqual]);
 * ```
 *
 * This is necessary because Jest's `expect` uses deep equality for instances
 * of classes, but the `__data` key marked as non-enumerable, and all properties
 * made lazy and defined as getters on the prototype, there are no keys on the
 * individual objects left for Jest to see & realize "these are different".
 */
export function areEntitiesEqual(a: unknown, b: unknown) {
  if (a instanceof BaseEntity && b instanceof BaseEntity) {
    return a === b || (a.em !== b.em && !a.isNewEntity && !b.isNewEntity && a.id === b.id);
  } else if (typeof a === "string" && b instanceof BaseEntity) {
    return a === b.id;
  } else if (typeof b === "string" && a instanceof BaseEntity) {
    return b === a.id;
  } else {
    return undefined;
  }
}

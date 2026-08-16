import { BaseEntity } from "joist-core";

import { type MatchedEntity } from "./toMatchEntity.ts";
export type { Context } from "./context.ts";
export { type ContextFn, makeRun, makeRunEach, newContext, run, runEach } from "./run.ts";
export { RunPlugin } from "./RunPlugin.ts";
export { seed, type SeedConfig } from "./seed.ts";
export { toMatchEntity } from "./toMatchEntity.ts";

export interface CustomMatcherResult {
  pass: boolean;
  message: () => string;
}

declare global {
  namespace jest {
    interface Matchers<R extends void | Promise<void>, T = {}> {
      toMatchEntity(expected: MatchedEntity<T>): CustomMatcherResult;
    }
  }
}
// @ts-ignore
declare module "expect" {
  interface Matchers<R extends void | Promise<void>, T = unknown> {
    toMatchEntity(expected: MatchedEntity<T>): CustomMatcherResult;
  }
}

// @ts-ignore
declare module "bun:test" {
  interface Matchers<T = unknown> {
    toMatchEntity(expected: MatchedEntity<T>): CustomMatcherResult;
  }
}

// @ts-ignore
declare module "vitest" {
  interface Assertion<T = any> {
    toMatchEntity(expected: MatchedEntity<T>): void;
  }
  interface AsymmetricMatchersContaining {
    toMatchEntity(expected: MatchedEntity<any>): void;
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

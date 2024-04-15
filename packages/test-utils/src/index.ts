import { MatchedEntity } from "./toMatchEntity";
export { Context } from "./context";
export { ContextFn, makeRun, makeRunEach, newContext, run, runEach } from "./run";
export { toMatchEntity } from "./toMatchEntity";
export { seed } from "./seed";

declare global {
  namespace jest {
    interface Matchers<R, T = {}> {
      toMatchEntity(expected: MatchedEntity<T>): CustomMatcherResult;
    }
  }
}

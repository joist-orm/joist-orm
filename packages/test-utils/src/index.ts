import { MatchedEntity } from "./toMatchEntity";
export { toMatchEntity } from "./toMatchEntity";

declare global {
  namespace jest {
    interface Matchers<R, T = {}> {
      toMatchEntity(expected: MatchedEntity<T>): Promise<CustomMatcherResult>;
    }
  }
}

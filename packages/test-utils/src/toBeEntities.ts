import CustomMatcherResult = jest.CustomMatcherResult;
import { Entity } from "joist-orm";
import { toMatchEntity } from "./toMatchEntity";

/**
 * Provides a `toBe` / `toEqual` matcher that correctly diffs Joist entities.
 *
 * In particular, when `toEqual` assertions fail, even with custom equality testers, the
 * Jest diff output for entities is huge and unhelpful.
 */
export function toBeEntities(this: any, actual: Entity[], expected: Entity[]): CustomMatcherResult {
  return toMatchEntity.call(this, actual, expected);
}

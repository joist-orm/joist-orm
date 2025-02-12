import { BaseEntity } from "joist-orm";

export function preventEqualsOnEntities(a: unknown, b: unknown): boolean | undefined {
  if (a instanceof BaseEntity || b instanceof BaseEntity) {
    throw new Error("Use toBeEntity, toBeEntities, or toMatchEntity for asserting against entities");
  }
  return undefined;
}

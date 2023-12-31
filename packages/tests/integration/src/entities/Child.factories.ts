import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "./entities";
import { Child } from "./entities";

export function newChild(em: EntityManager, opts: FactoryOpts<Child> = {}): DeepNew<Child> {
  return newTestInstance(em, Child, opts, {});
}

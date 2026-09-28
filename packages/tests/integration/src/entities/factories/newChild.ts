import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";

import { Child, type EntityManager } from "../entities";

export function newChild(em: EntityManager, opts: FactoryOpts<Child> = {}): DeepNew<Child> {
  return newTestInstance(em, Child, opts, {});
}

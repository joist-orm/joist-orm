import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";

import { type EntityManager, ParentGroup } from "../entities";

export function newParentGroup(em: EntityManager, opts: FactoryOpts<ParentGroup> = {}): DeepNew<ParentGroup> {
  return newTestInstance(em, ParentGroup, opts, {});
}

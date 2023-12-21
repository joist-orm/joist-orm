import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { ParentGroup } from "./entities";
import type { EntityManager } from "./entities";

export function newParentGroup(em: EntityManager, opts: FactoryOpts<ParentGroup> = {}): DeepNew<ParentGroup> {
  return newTestInstance(em, ParentGroup, opts, {});
}

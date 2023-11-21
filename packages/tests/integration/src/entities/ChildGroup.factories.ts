import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "./entities";
import { ChildGroup } from "./entities";

export function newChildGroup(em: EntityManager, opts: FactoryOpts<ChildGroup> = {}): DeepNew<ChildGroup> {
  return newTestInstance(em, ChildGroup, opts, {});
}

import { DeepNew, FactoryOpts, maybeBranchValue, newTestInstance } from "joist-orm";
import { ChildGroup, EntityManager, ParentGroup } from "./entities";

export function newChildGroup(em: EntityManager, opts: FactoryOpts<ChildGroup> = {}): DeepNew<ChildGroup> {
  return newTestInstance(em, ChildGroup, opts, {
    parentGroup: maybeBranchValue<ParentGroup>({}),
  });
}

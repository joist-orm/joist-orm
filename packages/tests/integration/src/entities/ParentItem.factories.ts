import { DeepNew, FactoryOpts, maybeBranchValue, newTestInstance } from "joist-orm";
import type { EntityManager } from "./entities";
import { ParentItem } from "./entities";

export const parentGroupBranchValue = [true];

export function newParentItem(em: EntityManager, opts: FactoryOpts<ParentItem> = {}): DeepNew<ParentItem> {
  const [useBranchValue] = parentGroupBranchValue;
  return newTestInstance(em, ParentItem, opts, {
    parentGroup: useBranchValue ? maybeBranchValue<ParentItem>() : {},
  });
}

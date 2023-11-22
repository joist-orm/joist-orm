import { maybeBranchValue, DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { ChildItem, EntityManager, ParentItem } from "./entities";

export function newChildItem(em: EntityManager, opts: FactoryOpts<ChildItem> = {}): DeepNew<ChildItem> {
  return newTestInstance(em, ChildItem, opts, {
    parentItem: maybeBranchValue<ParentItem>(),
  });
}

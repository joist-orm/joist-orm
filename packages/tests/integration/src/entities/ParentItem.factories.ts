import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "./entities";
import { ParentItem } from "./entities";

// Let tests change this
export const parentGroupValue: any = [undefined];

export function newParentItem(em: EntityManager, opts: FactoryOpts<ParentItem> = {}): DeepNew<ParentItem> {
  return newTestInstance(em, ParentItem, opts, {
    parentGroup: parentGroupValue[0],
  });
}

import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { ChildItem } from "./entities";
import type { EntityManager } from "./entities";

export function newChildItem(em: EntityManager, opts: FactoryOpts<ChildItem> = {}): DeepNew<ChildItem> {
  return newTestInstance(em, ChildItem, opts, {});
}

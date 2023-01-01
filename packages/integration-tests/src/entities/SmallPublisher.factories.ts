import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { SmallPublisher } from "./entities";
import type { EntityManager } from "./entities";

export function newSmallPublisher(em: EntityManager, opts: FactoryOpts<SmallPublisher> = {}): DeepNew<SmallPublisher> {
  return newTestInstance(em, SmallPublisher, opts);
}

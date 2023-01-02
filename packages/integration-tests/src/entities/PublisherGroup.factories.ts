import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "./entities";
import { PublisherGroup } from "./entities";

export function newPublisherGroup(em: EntityManager, opts: FactoryOpts<PublisherGroup> = {}): DeepNew<PublisherGroup> {
  return newTestInstance(em, PublisherGroup, { name: "name", ...opts });
}

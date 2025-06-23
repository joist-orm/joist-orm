import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";
import { type EntityManager, TinyPublisherGroup } from "../entities";

export function newTinyPublisherGroup(
  em: EntityManager,
  opts: FactoryOpts<TinyPublisherGroup> = {},
): DeepNew<TinyPublisherGroup> {
  return newTestInstance(em, TinyPublisherGroup, opts, {});
}

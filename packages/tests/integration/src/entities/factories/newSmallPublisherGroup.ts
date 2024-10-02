import { type DeepNew, type FactoryOpts, newTestInstance, testIndex } from "joist-orm";
import { type EntityManager, SmallPublisherGroup } from "../entities";

export function newSmallPublisherGroup(
  em: EntityManager,
  opts: FactoryOpts<SmallPublisherGroup> = {},
): DeepNew<SmallPublisherGroup> {
  return newTestInstance(em, SmallPublisherGroup, opts, {
    smallName: `small ${testIndex}`,
  });
}

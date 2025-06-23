import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";
import { type EntityManager, UserPublisherGroup } from "../entities";

export function newUserPublisherGroup(
  em: EntityManager,
  opts: FactoryOpts<UserPublisherGroup> = {},
): DeepNew<UserPublisherGroup> {
  return newTestInstance(em, UserPublisherGroup, opts, {});
}

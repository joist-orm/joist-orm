import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";
import { type EntityManager, Tag } from "../entities";

export function newTag(em: EntityManager, opts: FactoryOpts<Tag> = {}): DeepNew<Tag> {
  return newTestInstance(em, Tag, opts, {});
}

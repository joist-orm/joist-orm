import { EntityManager, FactoryOpts, New, newTestInstance } from "joist-orm";
import { Tag } from "./entities";

export function newTag(em: EntityManager, opts?: FactoryOpts<Tag>): New<Tag> {
  return newTestInstance(em, Tag, opts);
}

import { EntityManager, New, newTestInstance } from "joist-orm";
import { Tag } from "./entities";

// Example of using a completely different opts type
export function newTag(em: EntityManager, name: string): New<Tag> {
  return newTestInstance(em, Tag, { name });
}

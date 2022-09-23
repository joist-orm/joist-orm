import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "./entities";
import { Tag } from "./entities";

/** Example of using a completely different opts type. Use number so that the type isn't a string/look like a tagged id. */
export function newTag(em: EntityManager, name: number | FactoryOpts<Tag>): DeepNew<Tag> {
  if (typeof name === "number") {
    return newTestInstance(em, Tag, { name: String(name) });
  } else {
    return newTestInstance(em, Tag, name);
  }
}

import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { EntityManager } from "src/entities";
import { BlogPost } from "./entities";

export function newBlogPost(em: EntityManager, opts: FactoryOpts<BlogPost> = {}): DeepNew<BlogPost> {
  return newTestInstance(em, BlogPost, opts);
}

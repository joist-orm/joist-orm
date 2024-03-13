import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { Comment } from "../entities";
import type { EntityManager } from "../entities";

export function newComment(em: EntityManager, opts: FactoryOpts<Comment> = {}): DeepNew<Comment> {
  return newTestInstance(em, Comment, opts, {});
}

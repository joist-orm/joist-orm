import { DeepNew, EntityManager, FactoryOpts, newTestInstance } from "joist-orm";
import { Comment } from "../entities";

export function newComment(em: EntityManager, opts?: FactoryOpts<Comment>): DeepNew<Comment> {
  return newTestInstance(em, Comment, opts);
}

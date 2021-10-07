import { EntityManager, FactoryOpts, New, newTestInstance } from "joist-orm";
import { Comment } from "./entities";

export function newComment(em: EntityManager, opts?: FactoryOpts<Comment>): New<Comment> {
  return newTestInstance(em, Comment, opts);
}

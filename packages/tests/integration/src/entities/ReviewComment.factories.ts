import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "./entities";
import { ReviewComment } from "./entities";

export function newReviewComment(em: EntityManager, opts: FactoryOpts<ReviewComment> = {}): DeepNew<ReviewComment> {
  return newTestInstance(em, ReviewComment, opts, {});
}

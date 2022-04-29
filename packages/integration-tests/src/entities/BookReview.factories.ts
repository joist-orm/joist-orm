import { DeepNew, EntityManager, FactoryOpts, newTestInstance } from "joist-orm";
import { BookReview } from "./entities";

export function newBookReview(em: EntityManager, opts?: FactoryOpts<BookReview>): DeepNew<BookReview> {
  return newTestInstance(em, BookReview, opts);
}

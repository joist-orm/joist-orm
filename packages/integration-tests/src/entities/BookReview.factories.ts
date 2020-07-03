import { EntityManager, FactoryOpts, New, newTestInstance } from "joist-orm";
import { BookReview } from "./entities";

export function newBookReview(em: EntityManager, opts?: FactoryOpts<BookReview>): New<BookReview> {
  return newTestInstance(em, BookReview, opts);
}

import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";
import { BookReview, type EntityManager } from "../entities";

export function newBookReview(em: EntityManager, opts: FactoryOpts<BookReview> = {}): DeepNew<BookReview> {
  return newTestInstance(em, BookReview, opts, {});
}

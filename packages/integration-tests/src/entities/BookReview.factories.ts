import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { BookReview } from "./entities";
import type { EntityManager } from "./entities";

/** @ignore */
export function newBookReview(em: EntityManager, opts: FactoryOpts<BookReview> = {}): DeepNew<BookReview> {
  return newTestInstance(em, BookReview, opts);
}

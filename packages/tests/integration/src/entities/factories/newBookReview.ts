import { DeepNew, EntityManager, FactoryOpts, newTestInstance, testIndex } from "joist-orm";
import { BookReview } from "../entities";

export function newBookReview(em: EntityManager, opts: FactoryOpts<BookReview> = {}): DeepNew<BookReview> {
  return newTestInstance(em, BookReview, opts, {
    // Used to test useFactoryDefaults (without the maybeNew that is used in Book.factories.ts)
    book: { title: `Book for Review ${testIndex}` },
  });
}

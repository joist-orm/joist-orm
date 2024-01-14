import {
  AsyncProperty,
  cannotBeUpdated,
  hasOneDerived,
  hasOneThrough,
  hasReactiveField,
  hasReactiveAsyncProperty,
  ReactiveField,
  Reference,
} from "joist-orm";
import { Author, BookReviewCodegen, bookReviewConfig as config, Publisher } from "./entities";

export class BookReview extends BookReviewCodegen {
  // Currently this infers as Reference<BookReview, Author, undefined> --> it should be never...
  readonly author: Reference<BookReview, Author, never> = hasOneThrough((review) => review.book.author);
  transientFields = { numberOfIsPublicCalcs: 0, numberOfIsPublic2Calcs: 0 };

  // This is kind of silly domain wise, but used as an example of hasOneDerived with a load hint. We don't
  // technically have any conditional logic in `get` so could use a lens, but we want to test hasOneDerived.
  readonly publisher: Reference<BookReview, Publisher, undefined> = hasOneDerived(
    { book: { author: "publisher" } },
    (review) => review.book.get.author.get.publisher.get,
  );

  // Reviews are only public if the author is over the age of 21 and graduated (checking graduated b/c age is immutable)
  readonly isPublic: ReactiveField<BookReview, boolean> = hasReactiveField(
    "isPublic",
    { book: { author: ["age", "graduated"] } },
    (review) => {
      review.transientFields.numberOfIsPublicCalcs++;
      const author = review.book.get.author.get;
      // Currently our multi-hop reactivity recalc is more aggressive (runs before) our multi-hop
      // cascade deletion (which requires multiple 'pending loops' within `em.flush`), so we might
      // be invoked when Author/Book have been marked for deletion, and we _will_ be marked for
      // deletion soon, but have not yet.
      if (!author) return false;
      return !!author.age && author.age >= 21 && !!author.graduated;
    },
  );

  // Used to test dependent reactivity
  readonly isTest: ReactiveField<BookReview, boolean> = hasReactiveField(
    "isTest",
    { comment: "text" },
    (review) => {
      return !!review.comment.get?.text?.includes("Test");
    },
  );

  // Used to test reactivity to hasReactiveAsyncProperty results changing.
  readonly isPublic2: AsyncProperty<BookReview, boolean> = hasReactiveAsyncProperty({ comment: "text" }, (review) => {
    review.transientFields.numberOfIsPublic2Calcs++;
    return !review.comment.get?.text?.includes("Ignore");
  });
}

// Example of cannotBeUpdated on a m2o so "it won't be reactive" (but really is b/c of creates & deletes)
config.addRule(cannotBeUpdated("book"));

config.beforeDelete({ book: "author" }, (br) => {
  // to ensure relations are not cleared out until after all beforeDelete hooks are run, we walk through cascade delete
  // relations and ensure they're still present for the test "can cascade deletes through multiple levels" in
  // EntityManager.test.ts
  const book = br.book.getWithDeleted;
  const author = book.author.getWithDeleted;
  if (author === undefined) {
    throw new Error("author should be defined");
  }
});

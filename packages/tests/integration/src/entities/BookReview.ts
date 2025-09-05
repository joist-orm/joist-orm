import {
  AsyncProperty,
  cannotBeUpdated,
  hasOneDerived,
  hasOneThrough,
  hasReactiveAsyncProperty,
  hasReactiveField,
  ReactiveField,
  Reference,
  withLoaded,
} from "joist-orm";
import { Author, Book, BookReviewCodegen, bookReviewConfig as config, Publisher } from "./entities";

// For testing cross-entity hook ordering. Normally we'd used a transientFields flag, but we want
// the `Book.beforeFlush` to be able to read this value without a `"reviews"` load hint, as that
// would cause it's read to naturally fall after the `BookReview.beforeFlush` hook. Instead, we
// want to test that only the `config.runHooksBefore` is causing the `Book` hooks to wait a bit.
export const bookReviewBeforeFlushRan = { value: false };

export class BookReview extends BookReviewCodegen {
  // Currently this infers as Reference<BookReview, Author, undefined> --> it should be never...
  readonly author: Reference<BookReview, Author, never> = hasOneThrough((review) => review.book.author);
  transientFields = {
    numberOfIsPublicCalcs: 0,
    numberOfIsPublic2Calcs: 0,
  };

  // This is kind of silly domain wise, but used as an example of hasOneDerived with a load hint. We don't
  // technically have any conditional logic in `get` so could use a lens, but we want to test hasOneDerived.
  readonly publisher: Reference<BookReview, Publisher, undefined> = hasOneDerived(
    { book: { author: "publisher" } },
    (review) => review.book.get.author.get.publisher.get,
  );

  // Reviews are only public if:
  // - the author is over the age of 21,
  // - and graduated (checking graduated b/c age is immutable),
  // - and the review's comment does not include the word "private" (this prevents isPublic from being
  //   implicitly/hint loaded merely from having its author & book in-memory, which makes it harder to
  //   use isPublic as a test case reactivity caching).
  readonly isPublic: ReactiveField<BookReview, boolean> = hasReactiveField(
    "isPublic",
    { book: { author: ["age", "graduated"] }, comment: "text" },
    (review) => {
      review.transientFields.numberOfIsPublicCalcs++;
      const { book, comment } = withLoaded(review);
      const { author } = withLoaded(book);
      // Currently our multi-hop reactivity recalc is more aggressive (runs before) our multi-hop
      // cascade deletion (which requires multiple 'pending loops' within `em.flush`), so we might
      // be invoked when Author/Book have been marked for deletion, and we _will_ be marked for
      // deletion soon, but have not yet.
      if (!author) return false;
      return !!author.age && author.age >= 21 && !!author.graduated && !comment?.text?.includes("private");
    },
  );

  // Used to test dependent reactivity
  readonly isTest: ReactiveField<BookReview, boolean> = hasReactiveField("isTest", { comment: "text" }, (review) => {
    return !!review.comment.get?.text?.includes("Test");
  });
  
  // Used to test dependent reactivity
  readonly isTest2: ReactiveField<BookReview, boolean> = hasReactiveField("isTest2", "isTest", (review) => {
    return review.isTest.get;
  });

  // Used to test reactivity to hasReactiveAsyncProperty results changing.
  readonly isPublic2: AsyncProperty<BookReview, boolean> = hasReactiveAsyncProperty({ comment: "text" }, (review) => {
    review.transientFields.numberOfIsPublic2Calcs++;
    return !review.comment.get?.text?.includes("Ignore");
  });

  /** For testing reacting to poly CommentParent properties. */
  readonly commentParentInfo: AsyncProperty<BookReview, string> = hasReactiveAsyncProperty([], () => ``);
}

// Example of cannotBeUpdated on a m2o so "it won't be reactive" (but really is b/c of creates & deletes)
config.addRule(cannotBeUpdated("book"));

// For testing cross-entity hook ordering
config.runHooksBefore(Book);

// For testing cross-entity hook ordering
config.beforeFlush(() => {
  bookReviewBeforeFlushRan.value = true;
});

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

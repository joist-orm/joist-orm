import {
  AsyncProperty,
  cannotBeUpdated,
  hasOneDerived,
  hasOneThrough,
  hasPersistedAsyncProperty,
  hasReactiveAsyncProperty,
  PersistedAsyncProperty,
  Reference,
} from "joist-orm";
import { Author, BookReviewCodegen, bookReviewConfig as config, Publisher } from "./entities";

export class BookReview extends BookReviewCodegen {
  // Currently this infers as Reference<BookReview, Author, undefined> --> it should be never...
  readonly author: Reference<BookReview, Author, never> = hasOneThrough((review) => review.book.author);
  transientFields = { numberOfIsPublicCalcs: 0 };

  // This is kind of silly domain wise, but used as an example of hasOneDerived with a load hint. We don't
  // technically have any conditional logic in `get` so could use a lens, but we want to test hasOneDerived.
  readonly publisher: Reference<BookReview, Publisher, undefined> = hasOneDerived(
    { book: { author: "publisher" } },
    (review) => review.book.get.author.get.publisher.get,
  );

  // Reviews are only public if the author is over the age of 21 and graduated (checking graduated b/c age is immutable)
  readonly isPublic: PersistedAsyncProperty<BookReview, boolean> = hasPersistedAsyncProperty(
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
  readonly isTest: PersistedAsyncProperty<BookReview, boolean> = hasPersistedAsyncProperty(
    "isTest",
    { comment: "text" },
    (review) => {
      return !!review.comment.get?.text?.includes("Test");
    },
  );

  // Used to test reactivity to hasReactiveAsyncProperty results changing.
  readonly isPublic2: AsyncProperty<BookReview, boolean> = hasReactiveAsyncProperty({ comment: "text" }, (review) => {
    return !review.comment.get?.text?.includes("Ignore");
  });
}

// Example of cannotBeUpdated on a m2o so "it won't be reactive" (but really is b/c of creates & deletes)
config.addRule(cannotBeUpdated("book"));

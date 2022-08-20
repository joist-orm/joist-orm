import {
  cannotBeUpdated,
  DerivedAsyncProperty,
  hasDerivedAsyncProperty,
  hasOneDerived,
  hasOneThrough,
  Reference,
} from "joist-orm";
import { Author, BookReviewCodegen, bookReviewConfig as config, Publisher } from "./entities";

export class BookReview extends BookReviewCodegen {
  // Currently this infers as Reference<BookReview, Author, undefined> --> it should be never...
  readonly author: Reference<BookReview, Author, never> = hasOneThrough((review) => review.book.author);

  // This is kind of silly domain wise, but used as an example of hasOneDerived with a load hint. We don't
  // technically have any conditional logic in `get` so could use a lens, but we want to test hasOneDerived.
  readonly publisher: Reference<BookReview, Publisher, undefined> = hasOneDerived(
    { book: { author: "publisher" } },
    (review) => review.book.get.author.get.publisher.get,
  );

  // Reviews are only public if the author is over the age of 21 and graduated (checking graduated b/c age is immutable)
  readonly isPublic: DerivedAsyncProperty<BookReview, boolean> = hasDerivedAsyncProperty(
    "isPublic",
    { book: { author: ["age", "graduated"] } },
    (review) => {
      const author = review.book.get.author.get;
      return !!author.age && author.age >= 21 && !!author.graduated;
    },
  );
}

// Example of cannotBeUpdated on a m2o so "it won't be reactive" (but really is b/c of creates & deletes)
config.addRule(cannotBeUpdated("book"));

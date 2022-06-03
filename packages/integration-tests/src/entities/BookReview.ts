import { hasOneDerived, hasOneThrough, Reference } from "joist-orm";
import { Author, BookReviewCodegen, bookReviewConfig, Publisher } from "./entities";

export class BookReview extends BookReviewCodegen {
  // Currently this infers as Reference<BookReview, Author, undefined> --> it should be never...
  readonly author: Reference<BookReview, Author, never> = hasOneThrough((review) => review.book.author);

  // This is kind of silly domain wise, but used as an example of hasOneDerived with a load hint. We don't
  // technically have any conditional logic in `get` so could use a lens, but we want to test hasOneDerived.
  readonly publisher: Reference<BookReview, Publisher, undefined> = hasOneDerived(
    { book: { author: "publisher" } },
    (review) => review.book.get.author.get.publisher.get,
  );
}

// Reviews are only public if the author is over the age of 21 and graduated (checking graduated b/c age is immutable)
bookReviewConfig.setAsyncDerivedField("isPublic", { book: "author" }, (review) => {
  const author = review.book.get.author.get;
  return !!author.age && author.age >= 21 && !!author.graduated;
});

import { Reference } from "joist-orm";
import { Author, BookReviewCodegen, bookReviewConfig } from "./entities";

export class BookReview extends BookReviewCodegen {
  // Currently this infers as Reference<BookReview, Author, undefined> --> it should be never...
  readonly author: Reference<BookReview, Author, never> = this.hasOneThrough((review) => review.book.author);
}

// Reviews are only public if the author is over the age of 21
bookReviewConfig.setAsyncDerivedField("isPublic", { book: "author" }, (review) => {
  const author = review.book.get.author.get;
  return !!author.age && author.age >= 21;
});

import { BookReviewCodegen, bookReviewConfig, BookReviewOpts } from "./entities";
import { EntityManager } from "joist-orm";

export class BookReview extends BookReviewCodegen {
  constructor(em: EntityManager, opts: BookReviewOpts) {
    super(em, opts);
  }
}

// Reviews are only public if the author is over the age of 21
bookReviewConfig.setAsyncDerivedField("isPublic", { book: "author" }, (review) => {
  const author = review.book.get.author.get;
  return !!author.age && author.age >= 21;
});

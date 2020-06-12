import { Author, BookReviewCodegen, bookReviewConfig, BookReviewOpts } from "./entities";
import { CustomReference, EntityManager, Reference } from "joist-orm";

export class BookReview extends BookReviewCodegen {
  readonly author: Reference<BookReview, Author, never> = new CustomReference<
    BookReview,
    Author,
    { book: "author" },
    never
  >(this, "author", {
    load: async (review) => {
      await review.load((r) => r.book.author);
    },
    get: (review) => review.book.get.author.get,
    set: (review, author) => {
      review.book.get.author.set(author);
    },
    isSet: (review) => {
      return review.book.isSet() && review.book.get.author.isSet();
    },
  });

  constructor(em: EntityManager, opts: BookReviewOpts) {
    super(em, opts);
  }
}

// Reviews are only public if the author is over the age of 21
bookReviewConfig.setAsyncDerivedField("isPublic", { book: "author" }, (review) => {
  const author = review.book.get.author.get;
  return !!author.age && author.age >= 21;
});

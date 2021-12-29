import { Lens, OrmApi, Reference } from "joist-orm";
import { BookReviewCodegen, bookReviewConfig, Publisher } from "./entities";

type T = Lens<BookReview>;
const a: T = null!;
const b = a.book.author;

const orm = new OrmApi(null!);

export class BookReview extends BookReviewCodegen {
  // Be sure this infers as Reference<BookReview, Author, never>
  readonly author = this.orm.hasOneThrough((review) => review.book.author);

  // This is kind of silly domain wise, but used as an example of hasOneDerived with a load hint. We don't
  // technically have any conditional logic in `get` so could use a lens, but we want to test hasOneDerived.
  readonly publisher: Reference<BookReview, Publisher, undefined> = this.orm.hasOneDerived(
    { book: { author: "publisher" } },
    (review) => review.book.get.author.get.publisher.get,
  );
}

// Reviews are only public if the author is over the age of 21
bookReviewConfig.setAsyncDerivedField("isPublic", { book: "author" }, (review) => {
  const author = review.book.get.author.get;
  return !!author.age && author.age >= 21;
});

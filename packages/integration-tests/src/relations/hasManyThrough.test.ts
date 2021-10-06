import { insertAuthor, insertBook, insertBookReview } from "@src/entities/inserts";
import { Author, BookReview } from "../entities";
import { newEntityManager } from "../setupDbTests";

describe("hasManyThrough", () => {
  it("can load a collection", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "t", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = newEntityManager();
    const author = await em.load(Author, "1");
    const reviews = await author.reviews.load();
    expect(reviews).toHaveLength(1);
  });

  it("can populate a collection", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "t", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = newEntityManager();
    const author = await em.load(Author, "1", "reviews");
    expect(author.reviews.get).toHaveLength(1);
  });

  it("does not cache the values", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "t", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = newEntityManager();
    const author = await em.load(Author, "1", ["books", "reviews"]);
    const book = author.books.get[0];
    expect(author.reviews.get).toHaveLength(1);
    em.create(BookReview, { rating: 4, book });
    expect(author.reviews.get).toHaveLength(2);
  });
});

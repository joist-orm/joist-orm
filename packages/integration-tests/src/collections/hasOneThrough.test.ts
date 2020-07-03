import { Author, BookReview } from "@src/entities";
import { insertAuthor, insertBook, insertBookReview } from "@src/entities/inserts";
import { knex } from "@src/setupDbTests";
import { EntityManager } from "joist-orm";

describe("hasOneThrough", () => {
  it("can load a reference", async () => {
    await insertAuthor({ first_name: "f" });
    await insertBook({ title: "t", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = new EntityManager(knex);
    const review = await em.load(BookReview, "1");
    const author = await review.author.load();
    expect(author.firstName).toEqual("f");
  });

  it("can populate a reference", async () => {
    await insertAuthor({ first_name: "f" });
    await insertBook({ title: "t", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = new EntityManager(knex);
    const review = await em.load(BookReview, "1", "author");
    expect(review.author.get.firstName).toEqual("f");
  });

  it("does not cache the value", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "t", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = new EntityManager(knex);
    const a2 = await em.load(Author, "2");
    const review = await em.load(BookReview, "1", ["author", "book"]);
    expect(review.author.get.firstName).toEqual("a1");
    review.book.get.author.set(a2);
    expect(review.author.get.firstName).toEqual("a2");
  });
});

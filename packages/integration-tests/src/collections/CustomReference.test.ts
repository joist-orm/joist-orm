import { EntityManager } from "joist-orm";
import { knex, numberOfQueries, resetQueryCount } from "../setupDbTests";
import { Author, Book, BookReview } from "../entities";
import { insertAuthor, insertBook, insertBookReview, insertPublisher } from "../entities/factories";

describe("CustomReference", () => {
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

  it("can set a reference", async () => {
    const em = new EntityManager(knex);
    const author = em.create(Author, { firstName: "a1" });
    const book = em.createPartial(Book, { title: "t1" });
    const review = em.createPartial(BookReview, { book, rating: 5 });
    review.author.set(author);
    await em.flush();

    const rows = await knex.select("*").from("books");
    expect(rows[0].author_id).toEqual(1);
  });

  it("can set a reference through opts", async () => {
    const em = new EntityManager(knex);
    const author = em.create(Author, { firstName: "a1" });
    const book = em.createPartial(Book, { title: "t1" });
    em.createPartial(BookReview, { book, rating: 5, author } as any);
    await em.flush();

    const rows = await knex.select("*").from("books");
    expect(rows[0].author_id).toEqual(1);
  });

  it("can set changes to a loaded reference", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = new EntityManager(knex);
    const a2 = await em.load(Author, "2");
    const r1 = await em.load(BookReview, "1", "author");
    r1.author.set(a2);
    await em.flush();

    const rows = await knex.select("*").from("books");
    expect(rows[0].author_id).toEqual(2);
  });

  it("cannot set changes to a unloaded reference", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = new EntityManager(knex);
    const a2 = await em.load(Author, "2");
    const r1 = await em.load(BookReview, "1");

    expect(() => r1.author.set(a2)).toThrow("BookReview#1.author was not loaded");
  });
});

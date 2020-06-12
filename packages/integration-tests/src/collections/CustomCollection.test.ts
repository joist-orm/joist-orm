import { EntityManager } from "joist-orm";
import { keyToNumber } from "joist-orm/build/serde";
import { knex } from "../setupDbTests";
import { Author, Book, BookOpts, BookReview, Publisher, Tag } from "../entities";
import { insertAuthor, insertBook, insertBookReview, insertPublisher } from "../entities/factories";

describe("OneToManyCollection", () => {
  it("loads collections", async () => {
    await insertAuthorWithReviews();

    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    const books = await a1.reviews.load();
    expect(books.length).toEqual(2);
  });

  it("loads collections with instances already in the UoW", async () => {
    await insertAuthorWithReviews();

    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    await em.load(Book, "1");
    const r1 = await em.load(BookReview, "1");
    const reviews = await a1.reviews.load();
    expect(reviews[0] === r1).toEqual(true);
  });

  it("loads collections with populated instances already in the UoW", async () => {
    await insertAuthorWithReviews();

    const em = new EntityManager(knex);
    // Given r1.book.author is already populated with a1
    const r1 = await em.load(BookReview, "1", { book: "author" });
    const a1 = await em.load(Author, "1");
    expect(r1.book.get.author.get).toEqual(a1);
    // When we load a1.reviews
    const reviews = await a1.reviews.load();
    // Then we have both r1 and r2
    expect(reviews.length).toEqual(2);
    expect(reviews[0] === r1).toEqual(true);
  });

  it("references use collection-loaded instances from the UoW", async () => {
    await insertAuthorWithReviews();

    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    const books = await a1.books.load();
    // Pretend this is a reference
    const t1 = await em.load(Book, "1");
    expect(books[0] === t1).toEqual(true);
  });

  it("can add to collection", async () => {
    const em = new EntityManager(knex);
    const r1 = em.createUnsafe(BookReview, { rating: 4 }); // as any b/c we're testing .add
    const a1 = em.create(Author, { firstName: "a1" });
    a1.reviews.add(r1);
    expect((r1.book as any).get.author.get).toEqual(a1);
    await em.flush();

    const rows = await knex.select("*").from("books");
    expect(rows[0].author_id).toEqual(1);
  });

  it("fails when add is called without a callback", async () => {
    const em = new EntityManager(knex);
    const r1 = em.createUnsafe(BookReview, { rating: 4 });
    const a1 = em.create(Author, { firstName: "a1" });

    expect(() => a1.reviewsWithoutCallbacks.add(r1)).toThrow(
      "'add' not implemented on CustomCollection(entity: Author#undefined, fieldName: reviewsWithoutCallbacks)",
    );
  });

  it("can add to collection from the other side", async () => {
    const em = new EntityManager(knex);

    const a1 = em.create(Author, { firstName: "a1" });
    const b1 = em.createUnsafe(Book, { title: "b1" });
    const r1 = em.createUnsafe(BookReview, { rating: 3 });
    r1.book.set(b1);
    b1.author.set(a1);
    expect(a1.reviews.get).toContain(b1);
  });

  it("combines both pre-loaded and post-loaded entities", async () => {
    // Given an author with one book
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    // And we load the author
    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");

    // When we give the author a new book
    const b2 = em.create(Book, { title: "b2", author: a1 });
    // And load the books collection
    const books = await a1.books.load();

    // Then the collection has both books in it
    expect(books.length).toEqual(2);
    expect(books[0].id).toEqual(undefined);
    expect(books[1].id).toEqual("1");
  });

  it("removes deleted entities from other collections", async () => {
    // Given an author with a publisher
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    const em = new EntityManager(knex);
    // And the a1.publishers collection is loaded
    const a1 = await em.load(Author, "1", { publisher: "authors" });
    const p1 = a1.publisher.get!;
    expect(p1.authors.get.length).toEqual(1);
    // When we delete the author
    em.delete(a1);
    await em.flush();
    // Then it's removed from the Publisher.authors collection
    expect(p1.authors.get.length).toEqual(0);
  });

  it("respects deleted entities before the collection loaded", async () => {
    // Given an author with a publisher
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    const em = new EntityManager(knex);
    // And the a1.publishers collection is not loaded
    const a1 = await em.load(Author, "1");
    // And we delete the author
    em.delete(a1);
    await em.flush();
    // When we later load the p1.authors in the same Unit of Work
    const p1 = await em.load(Publisher, "1", "authors");
    // Then it's still removed from the Publisher.authors collection
    expect(p1.authors.get.length).toEqual(0);
  });

  it("can set to both add and remove", async () => {
    // Given the publisher already has a1 and a2
    await insertPublisher({ name: "p1" });
    await insertAuthor({ id: 1, first_name: "a1", publisher_id: 1 });
    await insertAuthor({ id: 2, first_name: "a2", publisher_id: 1 });
    await insertAuthor({ id: 3, first_name: "a3" });

    // When we set a2 and a3
    const em = new EntityManager(knex);
    const p1 = await em.load(Publisher, "1", "authors");
    const [a2, a3] = await em.loadAll(Author, ["2", "3"]);
    p1.authors.set([a2, a3]);
    await em.flush();

    // Then we removed a1, left a2, and added a3
    const rows = await knex.select("*").from("authors").orderBy("id");
    expect(rows.length).toEqual(3);
    expect(rows[0]).toEqual(expect.objectContaining({ publisher_id: null }));
    expect(rows[1]).toEqual(expect.objectContaining({ publisher_id: 1 }));
    expect(rows[2]).toEqual(expect.objectContaining({ publisher_id: 1 }));
  });

  it("does not duplicate items", async () => {
    // Given the publisher p1 already has an author a1
    await insertPublisher({ name: "p1" });
    await insertAuthor({ id: 1, first_name: "a1", publisher_id: 1 });

    // And we re-add a1 to the unloaded publisher collection
    const em = new EntityManager(knex);
    const p1 = await em.load(Publisher, "1");
    const a1 = await em.load(Author, "1");
    p1.authors.add(a1);

    // When we load authors
    const authors = await p1.authors.load();

    // Then we still only have one entry
    expect(authors.length).toEqual(1);
  });
});

async function insertAuthorWithReviews() {
  await insertAuthor({ first_name: "a1" });
  await insertBook({ title: "t1", author_id: 1 });
  await insertBook({ title: "t2", author_id: 1 });
  await insertBook({ title: "t3", author_id: 1 });
  await insertBookReview({ rating: 2, book_id: 1 });
  await insertBookReview({ rating: 3, book_id: 2 });
}

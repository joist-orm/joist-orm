import { EntityManager } from "joist-orm";
import { knex } from "../setupDbTests";
import { Author, Book, BookId, BookReview, Publisher } from "../entities";
import { insertAuthor, insertBook, insertPublisher } from "./factories";
import { newPgConnectionConfig } from "joist-utils";
import pgStructure from "pg-structure";

describe("Author", () => {
  it("can have business logic methods", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    const books = await a1.books.load();
    expect(books.length).toEqual(0);
  });

  it("can have validation logic", async () => {
    const em = new EntityManager(knex);
    new Author(em, { firstName: "a1", lastName: "a1" });
    await expect(em.flush()).rejects.toThrow("firstName and lastName must be different");
  });

  it("can have multiple validation rules", async () => {
    const em = new EntityManager(knex);
    new Author(em, { firstName: "NotAllowedLastName", lastName: "NotAllowedLastName" });
    await expect(em.flush()).rejects.toThrow(
      "Validation errors: firstName and lastName must be different, lastName is invalid",
    );
  });

  it("can have async validation rules", async () => {
    const em = new EntityManager(knex);
    const a1 = new Author(em, { firstName: "a1" });
    new Book(em, { title: "a1", author: a1 });
    await expect(em.flush()).rejects.toThrow("Validation error: A book title cannot be the author's firstName");
  });

  it("can have reactive validation rules", async () => {
    const em = new EntityManager(knex);
    // Given the book and author start out with acceptable names
    const a1 = new Author(em, { firstName: "a1" });
    const b1 = new Book(em, { title: "b1", author: a1 });
    await em.flush();
    // When the book name is later changed to collide with the author
    b1.title = "a1";
    // Then the validation rule is ran even though it's on the author entity
    await expect(em.flush()).rejects.toThrow("Validation error: A book title cannot be the author's firstName");
  });

  it("delete does not blow up due to reactive validation rules", async () => {
    // Given an author and book
    await insertAuthor({ first_name: "a1", number_of_books: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    const b1 = await em.load(Book, "1");
    // When we change the book
    b1.title = "b2";
    // And the book that it would reactively trigger is deleted
    em.delete(a1);
    // Then we can't b/c the book.author is required
    await expect(em.flush()).rejects.toThrow("Validation error: author is required");
  });

  it("cascading deletes does not blow up due to reactive validation rules", async () => {
    // Given an author and book
    await insertAuthor({ first_name: "a1", number_of_books: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    const b1 = await em.load(Book, "1");
    // When we change the book
    b1.title = "b2";
    // And also delete it
    em.delete(b1);
    // And the book that it would reactively trigger is deleted
    em.delete(a1);
    // Then it works
    await em.flush();
  });

  it("can have lifecycle hooks", async () => {
    const em = new EntityManager(knex);
    const a1 = new Author(em, { firstName: "a1" });
    expect(a1.beforeFlushRan).toBeFalsy();
    expect(a1.afterCommitRan).toBeFalsy();
    await em.flush();
    expect(a1.beforeFlushRan).toBeTruthy();
    expect(a1.afterCommitRan).toBeTruthy();
  });

  it("can have async derived values", async () => {
    const em = new EntityManager(knex);
    const a1 = new Author(em, { firstName: "a1" });
    new Book(em, { title: "b1", author: a1 });
    await em.flush();
    expect(a1.numberOfBooks).toEqual(1);
    const rows = await knex.select("*").from("authors");
    expect(rows[0].number_of_books).toEqual(1);
  });

  it("has async derived values automatically recalced", async () => {
    const em = new EntityManager(knex);
    // Given an author with initially no books
    const a1 = new Author(em, { firstName: "a1" });
    await em.flush();
    expect(a1.numberOfBooks).toEqual(0);
    // When we add a book
    new Book(em, { title: "b1", author: a1 });
    // Then the author derived value is re-derived
    await em.flush();
    expect(a1.numberOfBooks).toEqual(1);
    const rows = await knex.select("*").from("authors");
    expect(rows[0].number_of_books).toEqual(1);
  });

  it("can save when async derived values don't change", async () => {
    const em = new EntityManager(knex);
    // Given an author with a book
    const a1 = new Author(em, { firstName: "a1" });
    const b1 = new Book(em, { author: a1, title: "b1" });
    await em.flush();
    expect(a1.numberOfBooks).toEqual(1);
    // When we change the book
    b1.title = "b12";
    await em.flush();
    // Then the author derived value is didn't change
    expect(a1.numberOfBooks).toEqual(1);
  });

  it("has async derived values triggered on both old and new value", async () => {
    const em = new EntityManager(knex);
    // Given two authors
    const a1 = new Author(em, { firstName: "a1" });
    const a2 = new Author(em, { firstName: "a2" });
    //  And a book that is originally associated with a1
    const b1 = new Book(em, { title: "b1", author: a1 });
    await em.flush();
    expect(a1.numberOfBooks).toEqual(1);
    expect(a2.numberOfBooks).toEqual(0);
    // When we move the book to a2
    b1.author.set(a2);
    await em.flush();
    // Then both derived values got updated
    expect(a1.numberOfBooks).toEqual(0);
    expect(a2.numberOfBooks).toEqual(1);
  });

  it("has async derived values triggered on both lazy-loaded old and new value", async () => {
    const em = new EntityManager(knex);
    // Given a book & author already in the databaseo
    await insertAuthor({ first_name: "a1", number_of_books: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    // When we make a new author for b1 (and a1 is not even in the UnitOfWork)
    const a2 = new Author(em, { firstName: "a2" });
    const b1 = await em.load(Book, "1");
    b1.author.set(a2);
    await em.flush();
    // Then both authors derived values got updated
    const rows = await knex.select("id", "number_of_books").from("authors").orderBy("id");
    expect(rows[0]).toMatchObject({ id: 1, number_of_books: 0 });
    expect(rows[1]).toMatchObject({ id: 2, number_of_books: 1 });
  });

  it("cannot set async derived value", async () => {
    const em = new EntityManager(knex);
    const a1 = new Author(em, { firstName: "a1" });
    expect(() => {
      // @ts-expect-error
      a1.numberOfBooks = 1;
    }).toThrow("Cannot set property numberOfBooks");
  });

  it("cannot access async derived value before flush", async () => {
    const em = new EntityManager(knex);
    const a1 = new Author(em, { firstName: "a1" });
    expect(() => a1.numberOfBooks).toThrow("numberOfBooks has not been derived yet");
  });

  it("can derive async fields across multiple hops", async () => {
    // Given an author is who under age 21
    await insertAuthor({ first_name: "a1", age: 10 });
    await insertBook({ title: "b1", author_id: 1 });
    // And a new book review is created
    const em = new EntityManager(knex);
    const b1 = await em.load(Book, "1");
    em.create(BookReview, { rating: 1, book: b1 });
    await em.flush();
    // Then the review is initially private
    const rows = await knex.select("is_public").from("book_reviews");
    expect(rows[0].is_public).toBe(false);

    // And when the author age changes
    const em2 = new EntityManager(knex);
    const a1 = await em2.load(Author, "1");
    a1.age = 30;
    await em2.flush();
    // Then the review is now public
    const rows2 = await knex.select("is_public").from("book_reviews");
    expect(rows2[0].is_public).toBe(true);
  });

  describe("changes", () => {
    it("on create nothing is considered changed", async () => {
      const em = new EntityManager(knex);
      const a1 = new Author(em, { firstName: "f1", lastName: "ln" });
      expect(a1.changes.firstName.hasChanged).toBeFalsy();
      expect(a1.changes.firstName.originalValue).toBeUndefined();
    });

    it("after initial load nothing is considered changed", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = new EntityManager(knex);
      const a1 = await em.load(Author, "1");
      expect(a1.changes.firstName.hasChanged).toBeFalsy();
      expect(a1.changes.firstName.originalValue).toBeUndefined();
    });

    it("after initial load and mutate then hasChanged is true", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = new EntityManager(knex);
      const a1 = await em.load(Author, "1");
      expect(a1.changes.firstName.hasChanged).toBeFalsy();
      expect(a1.changes.firstName.originalValue).toBeUndefined();
      a1.firstName = "a2";
      expect(a1.changes.firstName.hasChanged).toBeTruthy();
      expect(a1.changes.firstName.originalValue).toEqual("a1");
    });

    it("does not have collections", async () => {
      const em = new EntityManager(knex);
      const a1 = new Author(em, { firstName: "f1", lastName: "ln" });
      // @ts-expect-error
      a1.changes.books;
    });

    it("works for references", async () => {
      await insertPublisher({ name: "p1" });
      await insertPublisher({ name: "p2" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = new EntityManager(knex);
      const a1 = await em.load(Author, "1");
      expect(a1.changes.publisher.hasChanged).toBeFalsy();
      expect(a1.changes.publisher.originalValue).toBeUndefined();
      a1.publisher.set(await em.load(Publisher, "2"));
      expect(a1.changes.publisher.hasChanged).toBeTruthy();
      expect(a1.changes.publisher.originalValue).toEqual("1");
    });
  });

  it("can enforce validation rules", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    a1.lastName = "l2";
    await expect(em.flush()).rejects.toThrow("Validation error: lastName cannot be changed");
  });

  it("can set new opts", async () => {
    const em = new EntityManager(knex);
    const author = new Author(em, { firstName: "a1", lastName: "a1" });
    author.set({ firstName: "a2", lastName: "a2" });
    expect(author.firstName).toEqual("a2");
    expect(author.lastName).toEqual("a2");
  });

  it("has strongly typed reference ids", () => {
    const author: Author = null!;
    let bookId: BookId = "1";
    // @ts-expect-error
    bookId = author?.mentor?.id!;
  });

  it("can set protected fields", async () => {
    const em = new EntityManager(knex);
    const author = new Author(em, { firstName: "a1", isPopular: true });
    expect(author.wasEverPopular).toEqual(true);
    await em.flush();
    // But they cannot be called directly
    expect(() => {
      // @ts-expect-error
      author.wasEverPopular = false;
    }).toThrow(TypeError);
  });

  it("setting optional fields to null is allowed", () => {
    const em = new EntityManager(knex);
    const author = new Author(em, { firstName: "a1" });
    author.set({ lastName: null });
    expect(author.lastName).toBeUndefined();
  });

  it("set can treat undefined as leave", () => {
    const em = new EntityManager(knex);
    const author = new Author(em, { firstName: "a1" });
    author.set({ firstName: undefined }, { ignoreUndefined: true });
    expect(author.firstName).toEqual("a1");
  });

  it("gets not-null validation rules for free", async () => {
    const em = new EntityManager(knex);
    em.createUnsafe(Author, {});
    await expect(em.flush()).rejects.toThrow("Validation error: firstName is required");
  });

  it("has an index on the publisher_id foreign key", async () => {
    // Ensures createEntityTable automatically creates indexes for foreign keys.
    const pgConfig = newPgConnectionConfig();
    const db = await pgStructure(pgConfig);
    const t = db.tables.find((t) => t.name === "authors")!;
    const i = t.indexes.find((i) => i.name === "authors_publisher_id_idx")!;
    expect(i).toBeTruthy();
  });

  it("has isNewEntity", async () => {
    const em = new EntityManager(knex);
    const a1 = await em.create(Author, { firstName: "a1" });
    expect(a1.isNewEntity).toBeTruthy();
    await em.flush();
    expect(a1.isNewEntity).toBeFalsy();
  });
});

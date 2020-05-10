import { EntityManager } from "joist-orm";
import { knex } from "../setupDbTests";
import { Author, Book, BookId } from "../entities";
import { insertAuthor } from "./factories";

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

  it("has async derived values that doesn't change recalced", async () => {
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

  describe("hasChanged", () => {
    it("on create nothing is considered changed", async () => {
      const em = new EntityManager(knex);
      const a1 = new Author(em, { firstName: "f1", lastName: "ln" });
      expect(a1.hasChanged.firstName).toBeFalsy();
    });

    it("after initial load nothing is considered changed", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = new EntityManager(knex);
      const a1 = await em.load(Author, "1");
      expect(a1.hasChanged.firstName).toBeFalsy();
    });

    it("after initial load and mutate then hasChanged is true", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = new EntityManager(knex);
      const a1 = await em.load(Author, "1");
      expect(a1.hasChanged.firstName).toBeFalsy();
      a1.firstName = "a2";
      expect(a1.hasChanged.firstName).toBeTruthy();
    });

    it("can enforce validation rules", async () => {
      await insertAuthor({ first_name: "a1", last_name: "l1" });
      const em = new EntityManager(knex);
      const a1 = await em.load(Author, "1");
      a1.lastName = "l2";
      await expect(em.flush()).rejects.toThrow("Validation error: lastName cannot be changed");
    });
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
});

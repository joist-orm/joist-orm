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

  it("can have lifecycle hooks", async () => {
    const em = new EntityManager(knex);
    const a1 = new Author(em, { firstName: "a1" });
    expect(a1.beforeFlushRan).toBeFalsy();
    expect(a1.afterCommitRan).toBeFalsy();
    await em.flush();
    expect(a1.beforeFlushRan).toBeTruthy();
    expect(a1.afterCommitRan).toBeTruthy();
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

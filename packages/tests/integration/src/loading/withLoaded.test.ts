import { withLoaded } from "joist-orm";
import { Book, newAuthor, newBook, newPublisher } from "src/entities";
import { insertAuthor, insertBook } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

describe("withLoaded", () => {
  it("with a async property", async () => {
    const em = newEntityManager();
    const author = newAuthor(em);
    const { numberOfBooks2 } = withLoaded(author);
    expect(numberOfBooks2).toBe(0);
  });

  it("with a reactive field", async () => {
    const em = newEntityManager();
    const author = newAuthor(em);
    const { numberOfPublicReviews } = withLoaded(author);
    expect(numberOfPublicReviews).toBe(0);
  });

  it("with a reactive reference", async () => {
    const em = newEntityManager();
    const author = newAuthor(em);
    const book = newBook(em);
    const { favoriteBook } = withLoaded(author);
    expect(favoriteBook).toMatchEntity(book);
  });

  it("with a reactive getter", async () => {
    const em = newEntityManager();
    const author = newAuthor(em);
    const { hasLowerCaseFirstName } = withLoaded(author);
    expect(hasLowerCaseFirstName).toBe(true);
  });

  it("with a reactive query field", async () => {
    const em = newEntityManager();
    const publisher = newPublisher(em);
    const { numberOfBookReviews } = withLoaded(publisher);
    expect(numberOfBookReviews).toBe(0);
  });

  it("with a m2o", async () => {
    const em = newEntityManager();
    const author = newAuthor(em, { publisher: {} });
    const { publisher } = withLoaded(author);
    expect(publisher?.name).toEqual("LargePublisher 1");
  });

  it("rejects destructuring an unloaded m2o and fails at runtime", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1");
    expect(() => {
      // @ts-expect-error author is not loaded
      const { author } = withLoaded(book);
    }).toThrow("Book:1.author is not loaded");
  });

  it("allows destructuring a loaded m2o", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1", "author");
    const { author } = withLoaded(book);
    expect(author.firstName).toBe("a1");
  });

  it("rejects an invalid key but returns undefined at runtime", async () => {
    const em = newEntityManager();
    const book = newBook(em);
    // @ts-expect-error invalidKey is not a Book property
    const { invalidKey } = withLoaded(book);
    expect(invalidKey).toBeUndefined();
  });

  it("with a m2o and primitive", async () => {
    const em = newEntityManager();
    const author = newAuthor(em, { publisher: {} });
    const { publisher, firstName } = withLoaded(author);
    expect(firstName).toEqual("a1");
    expect(publisher?.name).toEqual("LargePublisher 1");
  });
});

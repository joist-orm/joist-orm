import { Book, newAuthor, newBook, newPublisher } from "@src/entities";
import { newEntityManager } from "@src/testEm";
import { withLoaded } from "joist-orm";
import { insertAuthor, insertBook } from "src/entities/inserts";

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

  it("with an unloaded m2o", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1");
    expect(() => {
      const { author } = withLoaded(book as any);
    }).toThrow("Book:1.author is not loaded");
  });

  it("with a m2o and primitive", async () => {
    const em = newEntityManager();
    const author = newAuthor(em, { publisher: {} });
    const { publisher, firstName } = withLoaded(author);
    expect(firstName).toEqual("a1");
    expect(publisher?.name).toEqual("LargePublisher 1");
  });
});

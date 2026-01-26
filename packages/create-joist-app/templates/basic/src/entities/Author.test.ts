import { getEm } from "../setupTests";
import { newAuthor, newBook } from "./factories";

describe("Author", () => {
  it("can create an author", async () => {
    const em = getEm();
    const author = newAuthor(em, { firstName: "John", lastName: "Doe" });
    await em.flush();

    const loaded = await em.load(author.constructor, author.id);
    expect(loaded).toMatchEntity({ firstName: "John", lastName: "Doe" });
  });

  it("has a full name", async () => {
    const em = getEm();
    const author = newAuthor(em, { firstName: "Jane", lastName: "Smith" });
    expect(author.fullName).toBe("Jane Smith");
  });

  it("can have books", async () => {
    const em = getEm();
    const author = newAuthor(em, { firstName: "Test", lastName: "Author" });
    const book = newBook(em, { title: "Test Book", author });
    await em.flush();

    const books = await author.books.load();
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchEntity({ title: "Test Book" });
  });
});

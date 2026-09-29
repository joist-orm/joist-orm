import { Author, Book, newAuthor, newBook } from "src/entities";
import { db, newEntityManager } from "src/setupDbTests";

describe("Author", () => {
  it("works", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    expect(a).toMatchEntity({
      firstName: "firstName",
    });
  });

  it("can load an author", async () => {
    // Given an author in the db
    await flushAuthor("a1");
    // When we load it in a new em
    const a = await newEntityManager().load(Author, "a:1");
    // Then its columns are read back
    expect(a).toMatchEntity({ firstName: "a1", createdAt: expect.any(Date) });
  });

  it("can update an author", async () => {
    // Given an author in the db
    await flushAuthor("a1");
    // And we change it in a new em
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    a.firstName = "a2";
    // When we flush, which checks the oplock on updated_at
    await em.flush();
    // Then the row is updated
    expect(db.prepare("SELECT first_name FROM authors").all()).toEqual([{ first_name: "a2" }]);
  });

  it("can delete an author", async () => {
    // Given an author in the db
    await flushAuthor("a1");
    // And we delete it in a new em
    const em = newEntityManager();
    em.delete(await em.load(Author, "a:1"));
    // When we flush
    await em.flush();
    // Then the row is gone
    expect(db.prepare("SELECT id FROM authors").all()).toEqual([]);
  });

  it("can find authors by first name", async () => {
    // Given two authors in the db
    await flushAuthor("a1");
    await flushAuthor("a2");
    // When we find one of them
    const authors = await newEntityManager().find(Author, { firstName: "a2" });
    // Then only it is returned
    expect(authors).toMatchEntity([{ firstName: "a2" }]);
  });

  it("can find authors by ids", async () => {
    // Given three authors in the db
    await flushAuthor("a1");
    await flushAuthor("a2");
    await flushAuthor("a3");
    // When we find two of them, which uses `id = ANY(?)`
    const authors = await newEntityManager().find(Author, { id: ["a:1", "a:3"] }, { orderBy: { id: "ASC" } });
    // Then only they are returned
    expect(authors).toMatchEntity([{ firstName: "a1" }, { firstName: "a3" }]);
  });

  it("can populate books", async () => {
    // Given an author with two books in the db
    const em1 = newEntityManager();
    const a1 = newAuthor(em1);
    newBook(em1, { title: "b1", author: a1 });
    newBook(em1, { title: "b2", author: a1 });
    await em1.flush();
    // When we load the author with its books in a new em
    const a = await newEntityManager().load(Author, "a:1", "books");
    // Then both books are loaded
    expect(a.books.get).toMatchEntity([{ title: "b1" }, { title: "b2" }]);
  });

  it("can find books by author", async () => {
    // Given two authors, each with a book
    const em1 = newEntityManager();
    newBook(em1, { title: "b1", author: newAuthor(em1) });
    newBook(em1, { title: "b2", author: newAuthor(em1) });
    await em1.flush();
    // When we find the books of the 2nd author
    const books = await newEntityManager().find(Book, { author: "a:2" });
    // Then only its book is returned
    expect(books).toMatchEntity([{ title: "b2" }]);
  });
});

async function flushAuthor(firstName: string): Promise<void> {
  const em = newEntityManager();
  newAuthor(em, { firstName });
  await em.flush();
}

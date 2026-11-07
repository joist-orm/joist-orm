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

  it("can find authors with concurrent filters", async () => {
    // Given two authors with different first names
    const em1 = newEntityManager();
    newAuthor(em1, { firstName: "a1" });
    newAuthor(em1, { firstName: "a2" });
    await em1.flush();

    // When we find each author concurrently in the same EntityManager
    const em2 = newEntityManager();
    const results = await Promise.all([em2.find(Author, { firstName: "a1" }), em2.find(Author, { firstName: "a2" })]);

    // Then each filter returns only its matching author
    expect(results.map((authors) => authors.map((author) => author.firstName))).toEqual([["a1"], ["a2"]]);
  });

  it("can paginate concurrent author filters", async () => {
    // Given each first name matches two authors
    const em1 = newEntityManager();
    newAuthor(em1, { firstName: "a1" });
    newAuthor(em1, { firstName: "a1" });
    newAuthor(em1, { firstName: "a2" });
    newAuthor(em1, { firstName: "a2" });
    await em1.flush();

    // When we request the second author for each first name concurrently
    const em2 = newEntityManager();
    const options = { limit: 1, offset: 1, orderBy: { id: "ASC" as const } };
    const results = await Promise.all([
      em2.find(Author, { firstName: "a1" }, options),
      em2.find(Author, { firstName: "a2" }, options),
    ]);

    // Then each page contains the second matching author
    expect(results.map((authors) => authors.map((author) => author.id))).toEqual([["a:2"], ["a:4"]]);
  });

  it("can count authors with concurrent filters", async () => {
    // Given two authors share one first name and another has a different first name
    const em1 = newEntityManager();
    newAuthor(em1, { firstName: "a1" });
    newAuthor(em1, { firstName: "a1" });
    newAuthor(em1, { firstName: "a2" });
    await em1.flush();

    // When we count the authors for each first name concurrently
    const em2 = newEntityManager();
    const results = await Promise.all([
      em2.findCount(Author, { firstName: "a1" }),
      em2.findCount(Author, { firstName: "a2" }),
    ]);

    // Then each count includes only its matching authors
    expect(results).toEqual([2, 1]);
  });

  it("can find author ids with concurrent filters", async () => {
    // Given two authors with different first names
    const em1 = newEntityManager();
    newAuthor(em1, { firstName: "a1" });
    newAuthor(em1, { firstName: "a2" });
    await em1.flush();

    // When we find the ids for each first name concurrently
    const em2 = newEntityManager();
    const results = await Promise.all([
      em2.findIds(Author, { firstName: "a1" }),
      em2.findIds(Author, { firstName: "a2" }),
    ]);

    // Then each filter returns only its matching author id
    expect(results).toEqual([["a:1"], ["a:2"]]);
  });

  it("shares cached results for identical concurrent author filters", async () => {
    // Given an author in the database
    await flushAuthor("a1");

    // When we find that author twice concurrently in the same EntityManager
    const em = newEntityManager();
    const results = await Promise.all([em.find(Author, { firstName: "a1" }), em.find(Author, { firstName: "a1" })]);

    // Then both requests share the cached result
    expect(results[0]).toBe(results[1]);
  });
});

async function flushAuthor(firstName: string): Promise<void> {
  const em = newEntityManager();
  newAuthor(em, { firstName });
  await em.flush();
}

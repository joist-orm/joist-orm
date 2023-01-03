import { insertAuthor, insertBook, insertPublisherAsSmall, select, update } from "@src/entities/inserts";
import { Author, Book, newAuthor } from "../entities";
import { newEntityManager, numberOfQueries, resetQueryCount } from "../setupDbTests";

describe("ManyToOneReference", () => {
  it("can load a foreign key", async () => {
    await insertAuthor({ first_name: "f" });
    await insertBook({ title: "t", author_id: 1 });

    const em = newEntityManager();
    const book = await em.load(Book, "1");
    const author = await book.author.load();
    expect(author.firstName).toEqual("f");
  });

  it("can load a null foreign key", async () => {
    await insertAuthor({ first_name: "f" });
    const em = newEntityManager();
    const author = await em.load(Author, "1", "publisher");
    expect(author.publisher.get).toBeUndefined();
  });

  it("can save a foreign key", async () => {
    const em = newEntityManager();
    const author = new Author(em, { firstName: "a1" });
    new Book(em, { title: "t1", author });
    await em.flush();

    const rows = await select("books");
    expect(rows[0].author_id).toEqual(1);
  });

  it("batch loads foreign keys", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "t1", author_id: 1 });
    await insertBook({ title: "t2", author_id: 2 });

    const em = newEntityManager();
    const [b1, b2] = await Promise.all([em.load(Book, "1"), em.load(Book, "2")]);
    resetQueryCount();
    const [a1, a2] = await Promise.all([b1.author.load(), b2.author.load()]);
    expect(a1.firstName).toEqual("a1");
    expect(a2.firstName).toEqual("a2");
    expect(numberOfQueries).toEqual(1);
  });

  it("can save changes to a foreign key", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });

    const em = newEntityManager();
    const a2 = await em.load(Author, "2");
    const b1 = await em.load(Book, "1");
    b1.author.set(a2);
    await em.flush();

    const rows = await select("books");
    expect(rows[0].author_id).toEqual(2);
  });

  it("removes deleted entities from collections", async () => {
    // Given an author with a publisher
    await insertPublisherAsSmall({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    const em = newEntityManager();
    // And we load the author with a1.publisher already populated
    const a1 = await em.load(Author, "1", "publisher");
    const p1 = a1.publisher.get!;
    // When we delete the publisher
    em.delete(p1);
    await em.flush();
    // Then the a1.publisher field should be undefined
    expect(a1.publisher.get).toBeUndefined();
  });

  it("keeps collections up to date", async () => {
    const em = newEntityManager();
    // Given an author with a loaded list of books
    const a1 = em.create(Author, { firstName: "a1" });
    const b1 = em.create(Book, { title: "b1", author: a1 });
    // And the book is initially in the author's loaded collection
    expect(a1.books.get).toEqual([b1]);
    // When we make a new author and move to the book to it
    const a2 = em.create(Author, { firstName: "a2" });
    b1.author.set(a2);
    // Then both a1 and a2 book collections are correct
    expect(a1.books.get).toEqual([]);
    expect(a2.books.get).toEqual([b1]);
  });

  it("keeps collections up to date when set via id", async () => {
    const em = newEntityManager();
    // Given an author with a loaded list of books
    const a1 = em.create(Author, { firstName: "a1" });
    const b1 = em.create(Book, { title: "b1", author: a1 });
    // And the book is initially in the author's loaded collection
    expect(a1.books.get).toEqual([b1]);
    // When we make a new author and move to the book to it
    const a2 = em.create(Author, { firstName: "a2" });
    await em.flush();
    b1.author.id = "a:2";
    // Then both a1 and a2 book collections are correct
    expect(a1.books.get).toEqual([]);
    expect(a2.books.get).toEqual([b1]);
  });

  it("can refresh", async () => {
    const em = newEntityManager();
    // Given an author with a publisher
    const a1 = newAuthor(em, { publisher: {} });
    expect(a1.publisher.get).toBeDefined();
    await em.flush();
    // When another transaction unsets the fk
    await update("authors", { id: 1, publisher_id: null });
    // And we refresh
    await em.refresh(a1);
    // Then the foreign key is now unset
    expect(a1.publisher.get).toBeUndefined();
  });

  it("can forceReload with a new value", async () => {
    const em = newEntityManager();
    // Given an author with a publisher
    const a1 = newAuthor(em, { publisher: {} });
    expect(a1.publisher.get).toBeDefined();
    // When we forceReload the publisher
    await a1.publisher.load({ forceReload: true });
    // Then it is still defined
    expect(a1.publisher.get).toBeDefined();
  });
});

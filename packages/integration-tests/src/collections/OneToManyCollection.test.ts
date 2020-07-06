import { insertAuthor, insertBook, insertPublisher } from "@src/entities/inserts";
import { EntityManager } from "joist-orm";
import { Author, Book, BookOpts, Publisher } from "../entities";
import { knex } from "../setupDbTests";

describe("OneToManyCollection", () => {
  it("loads collections", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "t1", author_id: 1 });
    await insertBook({ title: "t2", author_id: 1 });

    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    const books = await a1.books.load();
    expect(books.length).toEqual(2);
  });

  it("loads collections with instances already in the UoW", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });

    const em = new EntityManager(knex);
    const b1 = await em.load(Book, "1");
    const a1 = await em.load(Author, "1");
    const books = await a1.books.load();
    expect(books[0] === b1).toEqual(true);
  });

  it("loads collections with populated instances already in the UoW", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    const em = new EntityManager(knex);
    // Given b1.author is already populated with a1
    const b1 = await em.load(Book, "1", "author");
    const a1 = await em.load(Author, "1");
    expect(b1.author.get).toEqual(a1);
    // When we load a1.books
    const books = await a1.books.load();
    // Then we have both b1 and b2
    expect(books.length).toEqual(2);
    expect(books[0] === b1).toEqual(true);
  });

  it("references use collection-loaded instances from the UoW", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "t1", author_id: 1 });
    await insertBook({ title: "t2", author_id: 1 });

    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    const books = await a1.books.load();
    // Pretend this is a reference
    const t1 = await em.load(Book, "1");
    expect(books[0] === t1).toEqual(true);
  });

  it("can add to collection", async () => {
    const em = new EntityManager(knex);
    const b1 = em.create(Book, ({ title: "b1" } as any) as BookOpts); // as any b/c we're testing .add
    const a1 = em.create(Author, { firstName: "a1" });
    a1.books.add(b1);
    expect(b1.author.get).toEqual(a1);
    await em.flush();

    const rows = await knex.select("*").from("books");
    expect(rows[0].author_id).toEqual(1);
  });

  it("can add to one collection and remove from other", async () => {
    // Given a book that has two potential authors as all new objects.
    const em = new EntityManager(knex);
    const b1 = em.create(Book, ({ title: "b1" } as any) as BookOpts); // as any b/c we're testing add
    const a1 = em.create(Author, { firstName: "a1" });
    const a2 = em.create(Author, { firstName: "a2" });

    // When we add it to the 1st
    a1.books.add(b1);
    expect(a1.books.get).toContain(b1);

    // But then add it to the 2nd author
    a2.books.add(b1);

    // Then the book is associated with only the 2nd author
    expect(b1.author.get).toEqual(a2);
    expect(a1.books.get.length).toEqual(0);
    expect(a2.books.get.length).toEqual(1);

    // And the book association to a2 is persisted to the database.
    await em.flush();
    const rows = await knex.select("*").from("books");
    expect(`a:${rows[0].author_id}`).toEqual(a2.id);
  });

  it("can add to one collection and remove from other when already persisted", async () => {
    // Given a book that has two potential authors as already persisted entities
    {
      const em = new EntityManager(knex);
      const b1 = em.create(Book, { title: "b1" } as any); // as any b/c we're testing add
      const a1 = em.create(Author, { firstName: "a1" });
      em.create(Author, { firstName: "a2" });
      b1.author.set(a1);
      await em.flush();
    }

    const em2 = new EntityManager(knex);
    // TODO Use populate when we have it.
    const b1_2 = await em2.load(Book, "1");
    const a1_2 = await em2.load(Author, "1");
    const a2_2 = await em2.load(Author, "2");

    // When we add the book to the 2nd author
    a2_2.books.add(b1_2);

    // Then the book is associated with only the 2nd author
    expect(await b1_2.author.load()).toEqual(a2_2);
    expect((await a1_2.books.load()).length).toEqual(0);
    expect((await a2_2.books.load()).length).toEqual(1);

    // And the book association to a2 is persisted to the database.
    await em2.flush();
    const rows = await knex.select("*").from("books");
    expect(`a:${rows[0].author_id}`).toEqual(a2_2.id);
  });

  it("can add to collection from the other side", async () => {
    const em = new EntityManager(knex);
    const b1 = em.create(Book, { title: "b1" } as any); // as any b/c we're testing set
    const a1 = em.create(Author, { firstName: "a1" });
    b1.author.set(a1);
    expect(a1.books.get).toContain(b1);
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
    expect(books[1].id).toEqual("b:1");
  });

  it("combines both pre-loaded and post-loaded removed entities", async () => {
    // Given an author with one book
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = new EntityManager(knex);
    const [a1, a2] = await em.find(Author, { id: ["1", "2"] });
    const b1 = await em.load(Book, "1", "author");

    // When we assign a new author
    b1.author.set(a2);

    // Then when we later load the author's books, it is empty
    expect((await a1.books.load()).length).toEqual(0);
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

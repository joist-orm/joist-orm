import { insertAuthor, insertBook, insertPublisher, select } from "@src/entities/inserts";
import { Author, Book, newAuthor, newBook, newPublisher, Publisher } from "../entities";
import { newEntityManager, numberOfQueries, resetQueryCount } from "../setupDbTests";

describe("OneToManyCollection", () => {
  it("loads collections", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "t1", author_id: 1 });
    await insertBook({ title: "t2", author_id: 1 });

    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    const books = await a1.books.load();
    expect(books.length).toEqual(2);
  });

  it("loads collections with instances already in the UoW", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });

    const em = newEntityManager();
    const b1 = await em.load(Book, "1");
    const a1 = await em.load(Author, "1");
    const books = await a1.books.load();
    expect(books[0] === b1).toEqual(true);
  });

  it("loads collections with populated instances already in the UoW", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    const em = newEntityManager();
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

    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    const books = await a1.books.load();
    // Pretend this is a reference
    const t1 = await em.load(Book, "1");
    expect(books[0] === t1).toEqual(true);
  });

  it("can add to collection", async () => {
    const em = newEntityManager();
    const b1 = em.create(Book, { title: "b1", author: undefined as any as Author }); // as any b/c we're testing .add
    const a1 = em.create(Author, { firstName: "a1" });
    a1.books.add(b1);
    expect(b1.author.get).toEqual(a1);
    await em.flush();

    const rows = await select("books");
    expect(rows[0].author_id).toEqual(1);
  });

  it("can add to one collection and remove from other", async () => {
    // Given a book that has two potential authors as all new objects.
    const em = newEntityManager();
    const b1 = em.create(Book, { title: "b1", author: undefined as any as Author }); // as any b/c we're testing add
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
    const rows = await select("books");
    expect(`a:${rows[0].author_id}`).toEqual(a2.id);
  });

  it("can add to one collection and remove from other when already persisted", async () => {
    // Given a book that has two potential authors as already persisted entities
    {
      const em = newEntityManager();
      const b1 = em.create(Book, { title: "b1" } as any); // as any b/c we're testing add
      const a1 = em.create(Author, { firstName: "a1" });
      em.create(Author, { firstName: "a2" });
      b1.author.set(a1);
      await em.flush();
    }

    const em2 = newEntityManager();
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
    const rows = await select("books");
    expect(`a:${rows[0].author_id}`).toEqual(a2_2.id);
  });

  it("can add to collection from the other side", async () => {
    const em = newEntityManager();
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
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");

    // When we give the author a new book
    const b2 = em.create(Book, { title: "b2", author: a1 });
    // And load the books collection
    const books = await a1.books.load();

    // Then the collection has both books in it
    expect(books.length).toEqual(2);
    expect(books[0].id).toEqual("b:1");
    expect(books[1].id).toEqual(undefined);
  });

  it("combines both pre-loaded and post-loaded removed entities", async () => {
    // Given an author with one book
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
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
    const em = newEntityManager();
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

  it("removes deleted entities from other foreign key", async () => {
    // Given an publisher with an author
    const em = newEntityManager();
    // And the publisher and authors are loaded
    const p1 = newPublisher(em, { authors: [{}] });
    const a1 = p1.authors.get[0];
    await em.flush();
    expect(p1.authors.get.length).toEqual(1);
    // When we delete the publisher
    em.delete(p1);
    await em.flush();
    // Then the author.publisher is cleared
    expect(a1.publisher.isSet).toEqual(false);
  });

  it("respects deleted entities before the collection loaded", async () => {
    // Given an author with a publisher
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    const em = newEntityManager();
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
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "1", "authors");
    const [a2, a3] = await em.loadAll(Author, ["2", "3"]);
    p1.authors.set([a2, a3]);
    await em.flush();

    // Then we removed a1, left a2, and added a3
    const rows = await select("authors");
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
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "1");
    const a1 = await em.load(Author, "1");
    p1.authors.add(a1);

    // When we load authors
    const authors = await p1.authors.load();

    // Then we still only have one entry
    expect(authors.length).toEqual(1);
  });

  it("can include on a new entity", async () => {
    // Given an existing book
    const em = newEntityManager();
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1" });
    const book = await em.load(Book, "b:1");
    resetQueryCount();
    // And a new author
    const author = newAuthor(em);
    // When we ask the author if it has the book
    const includes = await author.books.includes(book);
    // Then it does not
    expect(includes).toEqual(false);
    // And we did not need to make a query
    expect(numberOfQueries).toEqual(0);
  });

  it("can include on an existing entity", async () => {
    const em = newEntityManager();
    // Given two existing authors
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    // And one existing book
    await insertBook({ author_id: 1, title: "b1" });
    const [a1, a2] = await em.loadAll(Author, ["a:1", "a:2"]);
    const book = await em.load(Book, "b:1");
    resetQueryCount();
    // When we ask authors if they have the book
    const p1 = a1.books.includes(book);
    const p2 = a2.books.includes(book);
    const [i1, i2] = await Promise.all([p1, p2]);
    // Then the 1st does, the 2nd does not
    expect(i1).toEqual(true);
    expect(i2).toEqual(false);
    // And we didn't make any queries
    expect(numberOfQueries).toEqual(0);
  });

  it("can find on a new entity", async () => {
    // Given a book
    const em = newEntityManager();
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1" });
    resetQueryCount();
    // And a new author
    const author = newAuthor(em);
    // When we ask the author if it has the book
    const book = await author.books.find("b:1");
    // Then it does not
    expect(book).toBeUndefined();
    // And we did not need to make a query
    expect(numberOfQueries).toEqual(0);
  });

  it("can find on existing entities", async () => {
    // Given lots an author and many books
    const em = newEntityManager();
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1" });
    await insertBook({ author_id: 1, title: "b2" });
    await insertBook({ author_id: 1, title: "b3" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ author_id: 2, title: "b4" });
    const a1 = await em.load(Author, "a:1");
    const a2 = await em.load(Author, "a:2");
    resetQueryCount();
    // When we ask each author if it has a specific book
    const [p1, p2, p3] = [a1.books.find("b:1"), a1.books.find("b:4"), a2.books.find("b:4")];
    const [b1, bNone, b4] = await Promise.all([p1, p2, p3]);
    // Then they do
    expect(b1).toBeInstanceOf(Book);
    expect(bNone).toBeUndefined();
    expect(b4).toBeInstanceOf(Book);
    // And we used only a single query
    expect(numberOfQueries).toEqual(1);
    // And we did not load the other books
    expect(em.entities.length).toEqual(4);
    // And if we redo the find
    const b1_2 = await a1.books.find("b:1");
    // Then it was cached
    expect(b1_2).toEqual(b1);
    expect(numberOfQueries).toEqual(1);
  });

  it("can find just added entities on new entities", async () => {
    // Given an existing book
    const em = newEntityManager();
    const book = newBook(em);
    await em.flush();
    resetQueryCount();
    // When we make a new author
    const author = newAuthor(em);
    // And add the book to it
    author.books.add(book);
    // Then we can answer find
    const book_1 = await author.books.find(book.idOrFail);
    expect(book_1).toEqual(book);
    // And we did not make any db queries
    expect(numberOfQueries).toEqual(0);
  });
});

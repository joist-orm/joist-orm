import { Author, newAuthor, newBook, newPublisher, newTag } from "src/entities";
import { insertAuthor, insertBook } from "src/entities/inserts";
import { newEntityManager, numberOfQueries, resetQueryCount } from "src/testEm";

describe("hasAsyncMethod", () => {
  it("can be accessed via a promise", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "programming in action" });
    // Given a stock author
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    // When we access an async method
    const books = await a1.booksWithTitle.load("programming");
    // Then we get back the expected value
    expect(books).toMatchEntity([{ title: "programming in action" }]);
    // And it call it again via load
    resetQueryCount();
    const book2 = await a1.booksWithTitle.load("programming");
    expect(books).toMatchEntity([{ title: "programming in action" }]);
    // Then it didn't reload
    expect(numberOfQueries).toBe(0);
  });

  it("cannot be accessed via a call when unloaded", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "programming in action" });
    // Given a stock author
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    // When we access an async method via call, we get a compile error
    expect(() => {
      // @ts-expect-error
      a1.booksWithTitle.call("programming");
    }).toThrow("hasReactiveAsyncMethod.call was called but not loaded");
  });

  it("can be accessed via call when loaded", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "programming in action" });
    // Given an author with `booksWithTitle` loaded
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1", "booksWithTitle");
    // When we access an async method via call
    const books = a1.booksWithTitle.call("programming");
    // Then we get back the expected value
    expect(books).toMatchEntity([{ title: "programming in action" }]);
  });

  it("can be accessed via a call on deep new entities", async () => {
    const em = newEntityManager();
    // Given a factory-created author
    const a1 = newAuthor(em);
    // When we access an async method via call
    const books = a1.booksWithTitle.call("programming");
    // Then we get back the expected value
    expect(books).toMatchEntity([]);
  });

  it("without params can be accessed via a promise", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "programming in action" });
    // Given a stock author
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    // When we access an async method
    expect(await a1.booksTitles.load()).toBe("programming in action");
  });

  it("without params can be accessed via call", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "programming in action" });
    // Given a stock author
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1", "booksTitles");
    // When we access an async method
    expect(a1.booksTitles.call()).toBe("programming in action");
  });

  it("invalidates an application cache through another method's primitive dependencies before flush", async () => {
    // Given a persisted author with cached results
    const em = newEntityManager();
    const author = newAuthor(em);
    const book = newBook(em, { author, title: "Original" });
    await em.flush();
    await author.taggedBooksWithTitle.load("first", "Featured");
    await author.taggedBooksWithTitle.load("second", "Featured");
    // When a title declared by booksWithTitle changes
    book.title = "Revised";
    // Then taggedBooksWithTitle's application cache is already empty
    expect(author.transientFields.taggedBooks.size).toBe(0);
  });

  it("invalidates an application cache when book membership changes before flush", async () => {
    // Given an author with cached results and a book owned by another author
    const em = newEntityManager();
    const author = newAuthor(em);
    const book = newBook(em, { author: newAuthor(em) });
    await em.flush();
    await author.taggedBooksWithTitle.load("first", "Featured");
    // When the book moves to this author
    book.author.set(author);
    // Then the method's application cache is already empty
    expect(author.transientFields.taggedBooks.size).toBe(0);
  });

  it("invalidates an application cache for m2m membership before flush", async () => {
    // Given an author's book and an existing tag
    const em = newEntityManager();
    const author = newAuthor(em);
    const book = newBook(em, { author });
    const tag = newTag(em, { name: "Featured" });
    await em.flush();
    await author.taggedBooksWithTitle.load("first", "Featured");
    // When the book gains a tag
    book.tags.add(tag);
    // Then the method's application cache is already empty
    expect(author.transientFields.taggedBooks.size).toBe(0);
    // When the application rebuilds its cache and the tag is removed
    await author.taggedBooksWithTitle.load("first", "Featured");
    book.tags.remove(tag);
    // Then the new registration is invalidated too
    expect(author.transientFields.taggedBooks.size).toBe(0);
  });

  it("preserves cached results for unrelated fields and entity types", async () => {
    // Given an author with cached results
    const em = newEntityManager();
    const author = newAuthor(em);
    // And a publisher outside the declared dependencies
    const publisher = newPublisher(em);
    await em.flush();
    await author.taggedBooksWithTitle.load("first", "Featured");
    await author.taggedBooksWithTitle.load("second", "Featured");
    // When unrelated fields change
    author.firstName = "Changed";
    publisher.name = "Changed";
    // Then all cached results survive
    expect([...author.transientFields.taggedBooks.keys()]).toEqual([
      JSON.stringify(["first", "Featured"]),
      JSON.stringify(["second", "Featured"]),
    ]);
  });
});

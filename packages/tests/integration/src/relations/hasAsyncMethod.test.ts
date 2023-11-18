import { Author, newAuthor } from "@src/entities";
import { insertAuthor, insertBook } from "@src/entities/inserts";

import { newEntityManager, numberOfQueries, resetQueryCount } from "@src/testEm";

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
    }).toThrow("hasAsyncMethod.call was called but not loaded");
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
});

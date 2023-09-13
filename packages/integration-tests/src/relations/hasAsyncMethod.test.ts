import { Author } from "@src/entities";
import { insertAuthor, insertBook } from "@src/entities/inserts";
import { newEntityManager } from "@src/setupDbTests";

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
  });

  it("cannot be accessed via a get when unloaded", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "programming in action" });
    // Given a stock author
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    // When we access an async method via get, we get a compile error
    expect(() => {
      // @ts-expect-error
      a1.booksWithTitle.get("programming");
    }).toThrow("hasAsyncMethod.get was called but not loaded");
  });

  it("can be accessed via a get when loaded", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "programming in action" });
    // Given an author with `booksWithTitle` loaded
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1", "booksWithTitle");
    // When we access an async method via get
    const books = a1.booksWithTitle.get("programming");
    // Then we get back the expected value
    expect(books).toMatchEntity([{ title: "programming in action" }]);
  });
});

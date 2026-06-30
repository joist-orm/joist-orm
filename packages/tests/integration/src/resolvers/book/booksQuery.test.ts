import { books } from "src/resolvers/book/booksQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("books", () => {
  it.withCtx("returns books", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(books);

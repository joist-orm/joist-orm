import { books } from "src/resolvers/book/booksQuery.js";
import { makeRunQuery } from "src/resolvers/testUtils.js";

describe("books", () => {
  it.withCtx("returns books", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(books);

import { newBook } from "src/entities/index.js";
import { book } from "src/resolvers/book/bookQuery.js";
import { makeRunQuery } from "src/resolvers/testUtils.js";

describe("book", () => {
  it.withCtx("returns a Book", async (ctx) => {
    const b = newBook(ctx.em);
    const result = await run(ctx, () => ({ id: b.id }));
    expect(result).toMatchEntity(b);
  });
});

const run = makeRunQuery(book);

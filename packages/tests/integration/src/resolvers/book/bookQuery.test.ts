import { newBook } from "src/entities";
import { book } from "src/resolvers/book/bookQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("book", () => {
  it.withCtx("returns a Book", async (ctx) => {
    const b = newBook(ctx.em);
    const result = await run(ctx, () => ({ id: b.id }));
    expect(result).toMatchEntity(b);
  });
});

const run = makeRunQuery(book);

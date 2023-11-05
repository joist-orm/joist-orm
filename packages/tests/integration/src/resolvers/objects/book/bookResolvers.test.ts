import { newBook } from "src/entities";
import { bookResolvers } from "src/resolvers/objects/book/bookResolvers";
import { makeRunObjectFields } from "src/resolvers/testUtils";

describe("bookResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Book
    const b = newBook(em);
    // Then we can query it
    const result = await runBook(ctx, b, []);
    expect(result).toMatchObject({});
  });
});

const runBook = makeRunObjectFields(bookResolvers);

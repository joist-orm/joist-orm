import { newBook, BookId } from "src/entities";
import { makeRunResolverKeys } from "src/resolvers/testUtils";
import { BookResolvers } from "src/generated/graphql-types";
import { bookResolvers } from "src/resolvers/objects/book/bookResolvers";

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

const runBook = makeRunResolverKeys<BookResolvers, BookId>(bookResolvers);

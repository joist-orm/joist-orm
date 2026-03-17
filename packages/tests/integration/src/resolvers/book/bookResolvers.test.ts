import { newBook } from "src/entities";
import { bookResolvers } from "src/resolvers/book/bookResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("bookResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Book
    const b = newBook(em);
    // Then we can query it
    const result = await runFields(ctx, b, [
      "title",
      "order",
      "notes",
      "acknowledgements",
      "authorsNickNames",
      "search",
      "deletedAt",
      "createdAt",
      "updatedAt",
    ]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(bookResolvers);
const runField = makeRunObjectField(bookResolvers);

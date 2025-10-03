import { newBook } from "src/entities/index.js";
import { bookResolvers } from "src/resolvers/book/bookResolvers.js";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils.js";

describe("bookResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Book
    const b = newBook(em);
    // Then we can query it
    const result = await runFields(ctx, b, ["title"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(bookResolvers);
const runField = makeRunObjectField(bookResolvers);

import { newBookAdvance, BookAdvanceId } from "src/entities";
import { makeRunResolverKeys } from "src/resolvers/testUtils";
import { BookAdvanceResolvers } from "src/generated/graphql-types";
import { bookAdvanceResolvers } from "src/resolvers/objects/bookAdvance/bookAdvanceResolvers";

describe("bookAdvanceResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Book advance
    const ba = newBookAdvance(em);
    // Then we can query it
    const result = await runBookAdvance(ctx, ba, []);
    expect(result).toMatchObject({});
  });
});

const runBookAdvance = makeRunResolverKeys<BookAdvanceResolvers, BookAdvanceId>(bookAdvanceResolvers);

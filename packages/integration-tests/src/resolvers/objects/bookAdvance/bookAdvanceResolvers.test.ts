import { newBookAdvance } from "src/entities";
import { bookAdvanceResolvers } from "src/resolvers/objects/bookAdvance/bookAdvanceResolvers";
import { makeRunResolverKeys } from "src/resolvers/testUtils";

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

const runBookAdvance = makeRunResolverKeys(bookAdvanceResolvers);

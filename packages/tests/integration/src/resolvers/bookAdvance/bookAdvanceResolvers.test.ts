import { newBookAdvance } from "src/entities";
import { bookAdvanceResolvers } from "src/resolvers/bookAdvance/bookAdvanceResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("bookAdvanceResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Book advance
    const ba = newBookAdvance(em);
    // Then we can query it
    const result = await runFields(ctx, ba, ["createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(bookAdvanceResolvers);
const runField = makeRunObjectField(bookAdvanceResolvers);

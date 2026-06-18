import { newBookAdvance } from "src/entities";
import { bookAdvance } from "src/resolvers/bookAdvance/bookAdvanceQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("bookAdvance", () => {
  it.withCtx("returns a Book advance", async (ctx) => {
    const ba = newBookAdvance(ctx.em);
    const result = await run(ctx, () => ({ id: ba.id }));
    expect(result).toMatchEntity(ba);
  });
});

const run = makeRunQuery(bookAdvance);

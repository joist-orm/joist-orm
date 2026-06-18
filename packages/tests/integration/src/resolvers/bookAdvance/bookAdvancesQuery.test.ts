import { bookAdvances } from "src/resolvers/bookAdvance/bookAdvancesQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("bookAdvances", () => {
  it.withCtx("returns bookAdvances", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(bookAdvances);

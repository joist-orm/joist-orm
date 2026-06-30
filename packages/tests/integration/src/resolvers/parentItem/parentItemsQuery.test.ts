import { parentItems } from "src/resolvers/parentItem/parentItemsQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("parentItems", () => {
  it.withCtx("returns parentItems", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(parentItems);

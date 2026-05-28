import { childItems } from "src/resolvers/childItem/childItemsQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("childItems", () => {
  it.withCtx("returns childItems", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(childItems);

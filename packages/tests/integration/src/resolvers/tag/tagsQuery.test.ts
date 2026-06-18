import { tags } from "src/resolvers/tag/tagsQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("tags", () => {
  it.withCtx("returns tags", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(tags);

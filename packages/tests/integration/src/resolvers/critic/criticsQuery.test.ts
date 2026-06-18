import { critics } from "src/resolvers/critic/criticsQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("critics", () => {
  it.withCtx("returns critics", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(critics);

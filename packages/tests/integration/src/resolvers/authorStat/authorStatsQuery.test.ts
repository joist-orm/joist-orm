import { authorStats } from "src/resolvers/authorStat/authorStatsQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("authorStats", () => {
  it.withCtx("returns authorStats", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(authorStats);

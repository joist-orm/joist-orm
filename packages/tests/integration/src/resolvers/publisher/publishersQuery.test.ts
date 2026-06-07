import { publishers } from "src/resolvers/publisher/publishersQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("publishers", () => {
  it.withCtx("returns publishers", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(publishers);

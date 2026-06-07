import { children } from "src/resolvers/child/childrenQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("children", () => {
  it.withCtx("returns children", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(children);

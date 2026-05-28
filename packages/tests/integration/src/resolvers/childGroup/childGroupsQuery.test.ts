import { childGroups } from "src/resolvers/childGroup/childGroupsQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("childGroups", () => {
  it.withCtx("returns childGroups", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(childGroups);

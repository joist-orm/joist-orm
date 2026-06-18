import { parentGroups } from "src/resolvers/parentGroup/parentGroupsQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("parentGroups", () => {
  it.withCtx("returns parentGroups", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(parentGroups);

import { publisherGroups } from "src/resolvers/publisherGroup/publisherGroupsQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("publisherGroups", () => {
  it.withCtx("returns publisherGroups", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(publisherGroups);

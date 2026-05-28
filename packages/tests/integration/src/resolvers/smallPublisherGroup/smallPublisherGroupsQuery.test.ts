import { smallPublisherGroups } from "src/resolvers/smallPublisherGroup/smallPublisherGroupsQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("smallPublisherGroups", () => {
  it.withCtx("returns smallPublisherGroups", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(smallPublisherGroups);

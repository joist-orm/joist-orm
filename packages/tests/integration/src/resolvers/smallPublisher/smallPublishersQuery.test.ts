import { smallPublishers } from "src/resolvers/smallPublisher/smallPublishersQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("smallPublishers", () => {
  it.withCtx("returns smallPublishers", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(smallPublishers);

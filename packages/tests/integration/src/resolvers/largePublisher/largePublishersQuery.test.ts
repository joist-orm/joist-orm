import { largePublishers } from "src/resolvers/largePublisher/largePublishersQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("largePublishers", () => {
  it.withCtx("returns largePublishers", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(largePublishers);

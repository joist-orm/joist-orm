import { newLargePublisher } from "src/entities";
import { largePublisher } from "src/resolvers/largePublisher/largePublisherQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("largePublisher", () => {
  it.withCtx("returns a Large publisher", async (ctx) => {
    const p = newLargePublisher(ctx.em, { authors: [{}] });
    const result = await run(ctx, () => ({ id: p.id }));
    expect(result).toMatchEntity(p);
  });
});

const run = makeRunQuery(largePublisher);

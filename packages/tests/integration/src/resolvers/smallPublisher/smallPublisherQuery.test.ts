import { newSmallPublisher } from "src/entities";
import { smallPublisher } from "src/resolvers/smallPublisher/smallPublisherQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("smallPublisher", () => {
  it.withCtx("returns a Small publisher", async (ctx) => {
    const p = newSmallPublisher(ctx.em);
    const result = await run(ctx, () => ({ id: p.id }));
    expect(result).toMatchEntity(p);
  });
});

const run = makeRunQuery(smallPublisher);

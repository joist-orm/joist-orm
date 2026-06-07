import { newSmallPublisherGroup } from "src/entities";
import { smallPublisherGroup } from "src/resolvers/smallPublisherGroup/smallPublisherGroupQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("smallPublisherGroup", () => {
  it.withCtx("returns a Small publisher group", async (ctx) => {
    const pg = newSmallPublisherGroup(ctx.em);
    const result = await run(ctx, () => ({ id: pg.id }));
    expect(result).toMatchEntity(pg);
  });
});

const run = makeRunQuery(smallPublisherGroup);

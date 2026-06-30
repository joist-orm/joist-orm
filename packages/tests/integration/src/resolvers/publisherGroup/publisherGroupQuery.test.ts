import { newPublisherGroup } from "src/entities";
import { publisherGroup } from "src/resolvers/publisherGroup/publisherGroupQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("publisherGroup", () => {
  it.withCtx("returns a Publisher group", async (ctx) => {
    const pg = newPublisherGroup(ctx.em);
    const result = await run(ctx, () => ({ id: pg.id }));
    expect(result).toMatchEntity(pg);
  });
});

const run = makeRunQuery(publisherGroup);

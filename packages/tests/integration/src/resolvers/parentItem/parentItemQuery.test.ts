import { newParentItem } from "src/entities";
import { parentItem } from "src/resolvers/parentItem/parentItemQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("parentItem", () => {
  it.withCtx("returns a Parent item", async (ctx) => {
    const pi = newParentItem(ctx.em);
    const result = await run(ctx, () => ({ id: pi.id }));
    expect(result).toMatchEntity(pi);
  });
});

const run = makeRunQuery(parentItem);

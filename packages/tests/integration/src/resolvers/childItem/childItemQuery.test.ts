import { newChildItem } from "src/entities";
import { childItem } from "src/resolvers/childItem/childItemQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("childItem", () => {
  it.withCtx("returns a Child item", async (ctx) => {
    const ci = newChildItem(ctx.em);
    const result = await run(ctx, () => ({ id: ci.id }));
    expect(result).toMatchEntity(ci);
  });
});

const run = makeRunQuery(childItem);

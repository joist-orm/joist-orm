import { newParentGroup } from "src/entities";
import { parentGroup } from "src/resolvers/parentGroup/parentGroupQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("parentGroup", () => {
  it.withCtx("returns a Parent group", async (ctx) => {
    const parentGroup = newParentGroup(ctx.em);
    const result = await run(ctx, () => ({ id: parentGroup.id }));
    expect(result).toMatchEntity(parentGroup);
  });
});

const run = makeRunQuery(parentGroup);

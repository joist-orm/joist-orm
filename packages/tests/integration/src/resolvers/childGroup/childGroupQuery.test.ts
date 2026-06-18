import { newChildGroup } from "src/entities";
import { childGroup } from "src/resolvers/childGroup/childGroupQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("childGroup", () => {
  it.withCtx("returns a Child group", async (ctx) => {
    const cg = newChildGroup(ctx.em);
    const result = await run(ctx, () => ({ id: cg.id }));
    expect(result).toMatchEntity(cg);
  });
});

const run = makeRunQuery(childGroup);

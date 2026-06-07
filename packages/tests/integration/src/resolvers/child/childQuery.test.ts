import { newChild } from "src/entities";
import { child } from "src/resolvers/child/childQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("child", () => {
  it.withCtx("returns a Child", async (ctx) => {
    const child = newChild(ctx.em);
    const result = await run(ctx, () => ({ id: child.id }));
    expect(result).toMatchEntity(child);
  });
});

const run = makeRunQuery(child);

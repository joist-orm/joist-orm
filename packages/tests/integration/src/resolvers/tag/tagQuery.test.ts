import { newTag } from "src/entities";
import { tag } from "src/resolvers/tag/tagQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("tag", () => {
  it.withCtx("returns a Tag", async (ctx) => {
    const t = newTag(ctx.em, 1);
    const result = await run(ctx, () => ({ id: t.id }));
    expect(result).toMatchEntity(t);
  });
});

const run = makeRunQuery(tag);

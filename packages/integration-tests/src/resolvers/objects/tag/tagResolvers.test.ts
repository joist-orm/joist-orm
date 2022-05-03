import { newTag } from "src/entities";
import { tagResolvers } from "src/resolvers/objects/tag/tagResolvers";
import { makeRunResolverKeys } from "src/resolvers/testUtils";

describe("tagResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Tag
    const t = newTag(em, 0);
    // Then we can query it
    const result = await runTag(ctx, t, []);
    expect(result).toMatchObject({});
  });
});

const runTag = makeRunResolverKeys(tagResolvers);

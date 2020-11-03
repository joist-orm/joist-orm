import { newTag, TagId } from "src/entities";
import { makeRunResolverKeys } from "src/resolvers/testUtils";
import { TagResolvers } from "src/generated/graphql-types";
import { tagResolvers } from "src/resolvers/objects/tag/tagResolvers";

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

const runTag = makeRunResolverKeys<TagResolvers, TagId>(tagResolvers);

import { newTag } from "src/entities";
import { tagResolvers } from "src/resolvers/tag/tagResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("tagResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Tag
    const t = newTag(em);
    // Then we can query it
    const result = await runFields(ctx, t, ["name", "createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(tagResolvers);
const runField = makeRunObjectField(tagResolvers);

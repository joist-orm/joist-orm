import { newComment } from "src/entities";
import { commentResolvers } from "src/resolvers/comment/commentResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("commentResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Comment
    const comment = newComment(em);
    // Then we can query it
    const result = await runFields(ctx, comment, ["parentTaggedId", "parentTags", "text", "createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(commentResolvers);
const runField = makeRunObjectField(commentResolvers);

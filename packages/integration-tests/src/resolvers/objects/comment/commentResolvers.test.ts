import { newComment } from "src/entities";
import { commentResolvers } from "src/resolvers/objects/comment/commentResolvers";
import { makeRunObjectFields } from "src/resolvers/testUtils";

describe("commentResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Comment
    const comment = newComment(em);
    // Then we can query it
    const result = await runComment(ctx, comment, []);
    expect(result).toMatchObject({});
  });
});

const runComment = makeRunObjectFields(commentResolvers);

import { newInternalComment } from "src/entities";
import { internalCommentResolvers } from "src/resolvers/objects/internalComment/internalCommentResolvers";
import { makeRunObjectFields } from "src/resolvers/testUtils";

describe("internalCommentResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Internal comment
    const comment = newInternalComment(em, { textInternal: "foo" });
    // Then we can query it
    const result = await runInternalComment(ctx, comment, []);
    expect(comment).toMatchEntity(result);
  });
});

const runInternalComment = makeRunObjectFields(internalCommentResolvers);

import { saveComment } from "src/resolvers/mutations/comment/saveCommentResolver";
import { makeRunInputMutation } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe("saveComment", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveComment(ctx, () => ({}));
    // const comment = await em.load(Comment, result.comment);
  });
});

const runSaveComment = makeRunInputMutation(saveComment);

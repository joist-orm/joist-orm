import { saveReviewComment } from "src/resolvers/mutations/reviewComment/saveReviewCommentResolver";
import { makeRunInputMutation } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe("saveReviewComment", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveReviewComment(ctx, () => ({}));
  });
});

const runSaveReviewComment = makeRunInputMutation(saveReviewComment);

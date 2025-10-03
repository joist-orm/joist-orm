import { saveComment } from "src/resolvers/comment/saveCommentMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveComment", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveComment);

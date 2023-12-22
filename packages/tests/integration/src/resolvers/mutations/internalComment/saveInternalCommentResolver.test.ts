import { saveInternalComment } from "src/resolvers/mutations/internalComment/saveInternalCommentResolver";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe.skip("saveInternalComment", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveInternalComment(ctx, () => ({}));
    // expect(result).toBeDefined();
  });
});

const runSaveInternalComment = makeRunInputMutation(saveInternalComment);

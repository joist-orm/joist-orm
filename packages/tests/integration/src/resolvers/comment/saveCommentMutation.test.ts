import { newAuthor } from "src/entities";
import { saveComment } from "src/resolvers/comment/saveCommentMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveComment", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const a = newAuthor(em);
    const result = await runSave(ctx, () => ({ parent: a.id }));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveComment);

import { Context } from "src/context";
import { SaveCommentInput } from "src/generated/graphql-types";
import { saveComment } from "src/resolvers/mutations/comment/saveCommentResolver";
import { run } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe("saveComment", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveComment(ctx, () => ({}));
    // const comment = await em.load(Comment, result.comment);
  });
});

async function runSaveComment(ctx: Context, inputFn: () => SaveCommentInput) {
  return await run(ctx, async (ctx) => {
    return saveComment.saveComment({}, { input: inputFn() }, ctx, undefined!);
  });
}

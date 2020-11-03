import { Context } from "src/context";
import { SaveBookReviewInput } from "src/generated/graphql-types";
import { saveBookReview } from "src/resolvers/mutations/bookReview/saveBookReviewResolver";
import { run } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe("saveBookReview", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveBookReview(ctx, () => ({}));
    // const br = await em.load(BookReview, result.BookReview);
  });
});

async function runSaveBookReview(ctx: Context, inputFn: () => SaveBookReviewInput) {
  return await run(ctx, async (ctx) => {
    return saveBookReview.saveBookReview({}, { input: inputFn() }, ctx, undefined!);
  });
}

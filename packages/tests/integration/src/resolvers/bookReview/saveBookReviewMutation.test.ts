import { saveBookReview } from "src/resolvers/bookReview/saveBookReviewMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe.skip("saveBookReview", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveBookReview(ctx, () => ({}));
    // const br = await em.load(BookReview, result.BookReview);
  });
});

const runSaveBookReview = makeRunInputMutation(saveBookReview);

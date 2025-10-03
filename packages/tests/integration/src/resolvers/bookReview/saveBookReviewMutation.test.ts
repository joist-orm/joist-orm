import { saveBookReview } from "src/resolvers/bookReview/saveBookReviewMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveBookReview", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveBookReview);

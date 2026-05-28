import { bookReviews } from "src/resolvers/bookReview/bookReviewsQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("bookReviews", () => {
  it.withCtx("returns bookReviews", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(bookReviews);

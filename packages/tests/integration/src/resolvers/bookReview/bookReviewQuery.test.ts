import { newBookReview } from "src/entities";
import { bookReview } from "src/resolvers/bookReview/bookReviewQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("bookReview", () => {
  it.withCtx("returns a Book review", async (ctx) => {
    const br = newBookReview(ctx.em);
    const result = await run(ctx, () => ({ id: br.id }));
    expect(result).toMatchEntity(br);
  });
});

const run = makeRunQuery(bookReview);

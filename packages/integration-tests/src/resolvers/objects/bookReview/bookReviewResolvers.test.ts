import { newBookReview, BookReviewId } from "src/entities";
import { makeRunResolverKeys } from "src/resolvers/testUtils";
import { BookReviewResolvers } from "src/generated/graphql-types";
import { bookReviewResolvers } from "src/resolvers/objects/bookReview/bookReviewResolvers";

describe("bookReviewResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Book review
    const br = newBookReview(em);
    // Then we can query it
    const result = await runBookReview(ctx, br, []);
    expect(result).toMatchObject({});
  });
});

const runBookReview = makeRunResolverKeys<BookReviewResolvers, BookReviewId>(bookReviewResolvers);

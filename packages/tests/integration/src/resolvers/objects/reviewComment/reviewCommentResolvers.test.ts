import { newReviewComment } from "src/entities";
import { reviewCommentResolvers } from "src/resolvers/objects/reviewComment/reviewCommentResolvers";
import { makeRunResolver, makeRunResolverKeys } from "src/resolvers/testUtils";

describe("reviewCommentResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Review comment
    const comment = newReviewComment(em);
    // Then we can query it
    const result = await runReviewCommentKeys(ctx, comment, ["score"]);
    expect(comment).toMatchEntity(result);
  });
});

const runReviewCommentKeys = makeRunResolverKeys(reviewCommentResolvers);
const runReviewComment = makeRunResolver(reviewCommentResolvers);

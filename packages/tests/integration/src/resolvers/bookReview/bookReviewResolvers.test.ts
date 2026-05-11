import { newBookReview } from "src/entities";
import { bookReviewResolvers } from "src/resolvers/bookReview/bookReviewResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("bookReviewResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Book review
    const br = newBookReview(em);
    // Then we can query it
    const result = await runFields(ctx, br, ["rating", "isPublic", "isTest", "isTestChain", "createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(bookReviewResolvers);
const runField = makeRunObjectField(bookReviewResolvers);

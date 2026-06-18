import { BookReview } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const bookReviews: Pick<QueryResolvers, "bookReviews"> = {
  async bookReviews(_, args, ctx) {
    return paginate(ctx, BookReview, args);
  },
};

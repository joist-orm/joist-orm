import { getMetadata } from "joist-orm";
import { BookReview } from "src/entities";
import { BookReviewResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const bookReviewResolvers: BookReviewResolvers = {
  ...entityResolver(getMetadata(BookReview)),
};

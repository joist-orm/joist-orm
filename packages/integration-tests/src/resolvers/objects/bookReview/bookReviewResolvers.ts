import { BookReviewResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/entityResolver";
import { getMetadata } from "joist-orm";
import { BookReview } from "src/entities";

export const bookReviewResolvers: BookReviewResolvers = {
  ...entityResolver(getMetadata(BookReview)),
};

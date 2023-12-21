import { ReviewComment } from "src/entities";
import { ReviewCommentResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const reviewCommentResolvers: ReviewCommentResolvers = { ...entityResolver(ReviewComment) };

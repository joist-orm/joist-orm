import { getMetadata } from "joist-orm";
import { Comment } from "src/entities";
import { CommentResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/entityResolver";

export const commentResolvers: CommentResolvers = {
  ...entityResolver(getMetadata(Comment)),
};

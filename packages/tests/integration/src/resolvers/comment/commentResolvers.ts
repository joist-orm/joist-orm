import { Comment } from "src/entities";
import { CommentResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const commentResolvers: CommentResolvers = { ...entityResolver(Comment) };

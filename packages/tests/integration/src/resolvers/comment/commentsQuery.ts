import { Comment } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const comments: Pick<QueryResolvers, "comments"> = {
  async comments(_, args, ctx) {
    return paginate(ctx, Comment, args);
  },
};

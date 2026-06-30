import { TaskNew } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const taskNews: Pick<QueryResolvers, "taskNews"> = {
  async taskNews(_, args, ctx) {
    return paginate(ctx, TaskNew, args);
  },
};

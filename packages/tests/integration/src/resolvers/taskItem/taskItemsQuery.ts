import { TaskItem } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const taskItems: Pick<QueryResolvers, "taskItems"> = {
  async taskItems(_, args, ctx) {
    return paginate(ctx, TaskItem, args);
  },
};

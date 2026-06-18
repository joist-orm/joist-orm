import { TaskOld } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const taskOlds: Pick<QueryResolvers, "taskOlds"> = {
  async taskOlds(_, args, ctx) {
    return paginate(ctx, TaskOld, args);
  },
};

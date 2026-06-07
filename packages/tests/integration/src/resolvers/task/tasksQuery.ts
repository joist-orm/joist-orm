import { Task } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const tasks: Pick<QueryResolvers, "tasks"> = {
  async tasks(_, args, ctx) {
    return paginate(ctx, Task, args);
  },
};

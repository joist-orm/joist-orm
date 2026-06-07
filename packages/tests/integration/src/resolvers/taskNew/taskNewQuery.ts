import { TaskNew } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const taskNew: Pick<QueryResolvers, "taskNew"> = {
  async taskNew(_, args, ctx) {
    return ctx.em.load(TaskNew, args.id);
  },
};

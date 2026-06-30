import { TaskItem } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const taskItem: Pick<QueryResolvers, "taskItem"> = {
  async taskItem(_, args, ctx) {
    return ctx.em.load(TaskItem, args.id);
  },
};

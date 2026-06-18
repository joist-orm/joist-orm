import { Task } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const task: Pick<QueryResolvers, "task"> = {
  async task(_, args, ctx) {
    return ctx.em.load(Task, args.id);
  },
};

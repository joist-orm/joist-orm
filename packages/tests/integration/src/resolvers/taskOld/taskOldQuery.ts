import { TaskOld } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const taskOld: Pick<QueryResolvers, "taskOld"> = {
  async taskOld(_, args, ctx) {
    return ctx.em.load(TaskOld, args.id);
  },
};

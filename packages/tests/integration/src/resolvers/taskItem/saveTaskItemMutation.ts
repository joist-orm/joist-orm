import { TaskItem } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveTaskItem: Pick<MutationResolvers, "saveTaskItem"> = {
  async saveTaskItem(_, args, ctx) {
    return { taskItem: await saveEntity(ctx, TaskItem, args.input) };
  },
};

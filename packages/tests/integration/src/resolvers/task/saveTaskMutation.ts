import { Task } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveTask: Pick<MutationResolvers, "saveTask"> = {
  async saveTask(_, args, ctx) {
    return { task: await saveEntity(ctx, Task, args.input) };
  },
};

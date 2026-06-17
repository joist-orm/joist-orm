import { TaskNew } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveTaskNew: Pick<MutationResolvers, "saveTaskNew"> = {
  async saveTaskNew(_, args, ctx) {
    return { taskNew: await saveEntity(ctx, TaskNew, args.input) };
  },
};

import { TaskOld } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveTaskOld: Pick<MutationResolvers, "saveTaskOld"> = {
  async saveTaskOld(_, args, ctx) {
    return { taskOld: await saveEntity(ctx, TaskOld, args.input) };
  },
};

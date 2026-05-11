import { ChildGroup } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveChildGroup: Pick<MutationResolvers, "saveChildGroup"> = {
  async saveChildGroup(_, args, ctx) {
    return { childGroup: await saveEntity(ctx, ChildGroup, args.input) };
  },
};

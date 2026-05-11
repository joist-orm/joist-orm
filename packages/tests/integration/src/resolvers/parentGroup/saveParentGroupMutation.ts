import { ParentGroup } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveParentGroup: Pick<MutationResolvers, "saveParentGroup"> = {
  async saveParentGroup(_, args, ctx) {
    return { parentGroup: await saveEntity(ctx, ParentGroup, args.input) };
  },
};

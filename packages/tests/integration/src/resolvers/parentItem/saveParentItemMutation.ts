import { ParentItem } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveParentItem: Pick<MutationResolvers, "saveParentItem"> = {
  async saveParentItem(_, args, ctx) {
    return { parentItem: await saveEntity(ctx, ParentItem, args.input) };
  },
};

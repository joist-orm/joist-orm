import { ChildItem } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveChildItem: Pick<MutationResolvers, "saveChildItem"> = {
  async saveChildItem(_, args, ctx) {
    return { childItem: await saveEntity(ctx, ChildItem, args.input) };
  },
};

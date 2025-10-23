import { Tag } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveTag: Pick<MutationResolvers, "saveTag"> = {
  async saveTag(_, args, ctx) {
    return { tag: await saveEntity(ctx, Tag, args.input) };
  },
};

import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntities } from "src/resolvers/mutations/utils";
import { Tag } from "src/entities";

export const saveTag: Pick<MutationResolvers, "saveTag"> = {
  async saveTag(root, args, ctx) {
    const [id] = await saveEntities(ctx, Tag, [args.input]);
    return { tag: id };
  },
};

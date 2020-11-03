import { Tag } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntities } from "src/resolvers/mutations/utils";

export const saveTag: Pick<MutationResolvers, "saveTag"> = {
  async saveTag(root, args, ctx) {
    const [id] = await saveEntities(ctx, Tag, [args.input]);
    return { tag: id };
  },
};

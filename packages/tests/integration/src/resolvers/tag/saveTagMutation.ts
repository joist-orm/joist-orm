import { Tag } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntities } from "src/resolvers/mutations/utils";

export const saveTag: Pick<MutationResolvers, "saveTag"> = {
  async saveTag(_, args, ctx) {
    const [id] = await saveEntities(ctx, Tag, [args.input]);
    await ctx.em.flush();
    return { tag: id };
  },
};

import { Author } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntities } from "src/resolvers/mutations/utils";

export const saveAuthor: Pick<MutationResolvers, "saveAuthor"> = {
  async saveAuthor(root, args, ctx) {
    const [id] = await saveEntities(ctx, Author, [args.input]);
    await ctx.em.flush();
    return { author: id };
  },
};

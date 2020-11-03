import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntities } from "src/resolvers/mutations/utils";
import { Author } from "src/entities";

export const saveAuthor: Pick<MutationResolvers, "saveAuthor"> = {
  async saveAuthor(root, args, ctx) {
    const [id] = await saveEntities(ctx, Author, [args.input]);
    return { author: id };
  },
};

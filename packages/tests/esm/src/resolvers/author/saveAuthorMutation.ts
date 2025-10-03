import { Author } from "src/entities/index.js";
import { MutationResolvers } from "src/generated/graphql-types.js";
import { saveEntity } from "src/resolvers/utils.js";

export const saveAuthor: Pick<MutationResolvers, "saveAuthor"> = {
  async saveAuthor(_, args, ctx) {
    return { author: await saveEntity(ctx, Author, args.input) };
  },
};

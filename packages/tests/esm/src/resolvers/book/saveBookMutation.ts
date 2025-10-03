import { Book } from "src/entities/index.js";
import { MutationResolvers } from "src/generated/graphql-types.js";
import { saveEntity } from "src/resolvers/utils.js";

export const saveBook: Pick<MutationResolvers, "saveBook"> = {
  async saveBook(_, args, ctx) {
    return { book: await saveEntity(ctx, Book, args.input) };
  },
};

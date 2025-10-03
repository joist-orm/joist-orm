import { Book } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveBook: Pick<MutationResolvers, "saveBook"> = {
  async saveBook(_, args, ctx) {
    return { book: await saveEntity(ctx, Book, args.input) };
  },
};

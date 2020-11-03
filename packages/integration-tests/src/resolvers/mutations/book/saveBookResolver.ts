import { Book } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntities } from "src/resolvers/mutations/utils";

export const saveBook: Pick<MutationResolvers, "saveBook"> = {
  async saveBook(root, args, ctx) {
    const [id] = await saveEntities(ctx, Book, [args.input]);
    return { book: id };
  },
};

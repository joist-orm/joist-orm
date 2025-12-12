import { BookReview } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveBookReview: Pick<MutationResolvers, "saveBookReview"> = {
  async saveBookReview(_, args, ctx) {
    return { bookReview: await saveEntity(ctx, BookReview, args.input) };
  },
};

import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntities } from "src/resolvers/mutations/utils";
import { BookReview } from "src/entities";

export const saveBookReview: Pick<MutationResolvers, "saveBookReview"> = {
  async saveBookReview(root, args, ctx) {
    const [id] = await saveEntities(ctx, BookReview, [args.input]);
    return { bookReview: id };
  },
};

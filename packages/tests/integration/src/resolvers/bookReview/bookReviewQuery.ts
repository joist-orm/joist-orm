import { BookReview } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const bookReview: Pick<QueryResolvers, "bookReview"> = {
  async bookReview(_, args, ctx) {
    return ctx.em.load(BookReview, args.id);
  },
};

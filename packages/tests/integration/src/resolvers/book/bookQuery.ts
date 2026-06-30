import { Book } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const book: Pick<QueryResolvers, "book"> = {
  async book(_, args, ctx) {
    return ctx.em.load(Book, args.id);
  },
};

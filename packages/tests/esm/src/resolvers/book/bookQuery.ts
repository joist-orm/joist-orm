import { Book } from "src/entities/index.js";
import type { QueryResolvers } from "src/generated/graphql-types.js";

export const book: Pick<QueryResolvers, "book"> = {
  async book(_, args, ctx) {
    return ctx.em.load(Book, args.id);
  },
};

import { Book } from "src/entities/index.js";
import type { QueryResolvers } from "src/generated/graphql-types.js";
import { paginate } from "src/resolvers/utils.js";

export const books: Pick<QueryResolvers, "books"> = {
  async books(_, args, ctx) {
    return paginate(ctx, Book, args);
  },
};

import { Book } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const books: Pick<QueryResolvers, "books"> = {
  async books(_, args, ctx) {
    return paginate(ctx, Book, args);
  },
};

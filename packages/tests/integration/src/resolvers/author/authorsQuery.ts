import { Author } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const authors: Pick<QueryResolvers, "authors"> = {
  async authors(_, args, ctx) {
    return paginate(ctx, Author, args);
  },
};

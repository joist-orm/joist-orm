import { AuthorStat } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const authorStats: Pick<QueryResolvers, "authorStats"> = {
  async authorStats(_, args, ctx) {
    return paginate(ctx, AuthorStat, args);
  },
};

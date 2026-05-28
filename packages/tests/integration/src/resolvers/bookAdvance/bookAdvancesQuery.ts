import { BookAdvance } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const bookAdvances: Pick<QueryResolvers, "bookAdvances"> = {
  async bookAdvances(_, args, ctx) {
    return paginate(ctx, BookAdvance, args);
  },
};

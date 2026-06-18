import { CriticColumn } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const criticColumns: Pick<QueryResolvers, "criticColumns"> = {
  async criticColumns(_, args, ctx) {
    return paginate(ctx, CriticColumn, args);
  },
};

import { ParentItem } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const parentItems: Pick<QueryResolvers, "parentItems"> = {
  async parentItems(_, args, ctx) {
    return paginate(ctx, ParentItem, args);
  },
};

import { ChildItem } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const childItems: Pick<QueryResolvers, "childItems"> = {
  async childItems(_, args, ctx) {
    return paginate(ctx, ChildItem, args);
  },
};

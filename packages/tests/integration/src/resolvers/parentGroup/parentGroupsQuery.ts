import { ParentGroup } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const parentGroups: Pick<QueryResolvers, "parentGroups"> = {
  async parentGroups(_, args, ctx) {
    return paginate(ctx, ParentGroup, args);
  },
};

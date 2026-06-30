import { ChildGroup } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const childGroups: Pick<QueryResolvers, "childGroups"> = {
  async childGroups(_, args, ctx) {
    return paginate(ctx, ChildGroup, args);
  },
};

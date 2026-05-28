import { SmallPublisherGroup } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const smallPublisherGroups: Pick<QueryResolvers, "smallPublisherGroups"> = {
  async smallPublisherGroups(_, args, ctx) {
    return paginate(ctx, SmallPublisherGroup, args);
  },
};

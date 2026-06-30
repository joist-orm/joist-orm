import { SmallPublisher } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const smallPublishers: Pick<QueryResolvers, "smallPublishers"> = {
  async smallPublishers(_, args, ctx) {
    return paginate(ctx, SmallPublisher, args);
  },
};

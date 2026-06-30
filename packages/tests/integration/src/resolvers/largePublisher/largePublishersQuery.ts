import { LargePublisher } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const largePublishers: Pick<QueryResolvers, "largePublishers"> = {
  async largePublishers(_, args, ctx) {
    return paginate(ctx, LargePublisher, args);
  },
};

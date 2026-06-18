import { PublisherGroup } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const publisherGroups: Pick<QueryResolvers, "publisherGroups"> = {
  async publisherGroups(_, args, ctx) {
    return paginate(ctx, PublisherGroup, args);
  },
};

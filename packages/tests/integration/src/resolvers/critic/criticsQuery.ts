import { Critic } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const critics: Pick<QueryResolvers, "critics"> = {
  async critics(_, args, ctx) {
    return paginate(ctx, Critic, args);
  },
};

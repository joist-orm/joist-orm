import { User } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const users: Pick<QueryResolvers, "users"> = {
  async users(_, args, ctx) {
    return paginate(ctx, User, args);
  },
};

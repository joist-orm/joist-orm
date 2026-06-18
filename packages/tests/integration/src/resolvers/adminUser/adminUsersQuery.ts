import { AdminUser } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const adminUsers: Pick<QueryResolvers, "adminUsers"> = {
  async adminUsers(_, args, ctx) {
    return paginate(ctx, AdminUser, args);
  },
};

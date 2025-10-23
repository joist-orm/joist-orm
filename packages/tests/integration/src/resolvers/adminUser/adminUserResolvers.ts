import { AdminUser } from "src/entities";
import { AdminUserResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const adminUserResolvers: AdminUserResolvers = { ...entityResolver(AdminUser) };

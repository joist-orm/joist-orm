import { AdminUser } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const adminUser: Pick<QueryResolvers, "adminUser"> = {
  async adminUser(_, args, ctx) {
    return ctx.em.load(AdminUser, args.id);
  },
};

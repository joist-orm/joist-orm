import { AdminUser } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveAdminUser: Pick<MutationResolvers, "saveAdminUser"> = {
  async saveAdminUser(_, args, ctx) {
    return { adminUser: await saveEntity(ctx, AdminUser, args.input) };
  },
};

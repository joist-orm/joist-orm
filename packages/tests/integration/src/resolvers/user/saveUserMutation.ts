import { User } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveUser: Pick<MutationResolvers, "saveUser"> = {
  async saveUser(root, args, ctx) {
    return { user: await saveEntity(ctx, User, args.input) };
  },
};

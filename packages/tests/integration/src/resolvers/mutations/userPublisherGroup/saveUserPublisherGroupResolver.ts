import { UserPublisherGroup } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveUserPublisherGroup: Pick<MutationResolvers, "saveUserPublisherGroup"> = {
  async saveUserPublisherGroup(_, args, ctx) {
    return { userPublisherGroup: await saveEntity(ctx, UserPublisherGroup, args.input) };
  },
};

import { SmallPublisherGroup } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveSmallPublisherGroup: Pick<MutationResolvers, "saveSmallPublisherGroup"> = {
  async saveSmallPublisherGroup(_, args, ctx) {
    return { smallPublisherGroup: await saveEntity(ctx, SmallPublisherGroup, args.input) };
  },
};

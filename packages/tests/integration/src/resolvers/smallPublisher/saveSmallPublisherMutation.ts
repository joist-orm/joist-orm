import { SmallPublisher } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveSmallPublisher: Pick<MutationResolvers, "saveSmallPublisher"> = {
  async saveSmallPublisher(_, args, ctx) {
    return { smallPublisher: await saveEntity(ctx, SmallPublisher, args.input) };
  },
};

import { LargePublisher } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveLargePublisher: Pick<MutationResolvers, "saveLargePublisher"> = {
  async saveLargePublisher(root, args, ctx) {
    return { largePublisher: await saveEntity(ctx, LargePublisher, args.input) };
  },
};

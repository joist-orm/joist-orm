import { TinyPublisherGroup } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveTinyPublisherGroup: Pick<MutationResolvers, "saveTinyPublisherGroup"> = {
  async saveTinyPublisherGroup(_, args, ctx) {
    return { tinyPublisherGroup: await saveEntity(ctx, TinyPublisherGroup, args.input) };
  },
};

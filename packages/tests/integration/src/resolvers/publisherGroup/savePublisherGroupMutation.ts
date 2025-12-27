import { PublisherGroup } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const savePublisherGroup: Pick<MutationResolvers, "savePublisherGroup"> = {
  async savePublisherGroup(_, args, ctx) {
    return { publisherGroup: await saveEntity(ctx, PublisherGroup, args.input) };
  },
};

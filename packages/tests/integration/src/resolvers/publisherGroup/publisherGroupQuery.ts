import { PublisherGroup } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const publisherGroup: Pick<QueryResolvers, "publisherGroup"> = {
  async publisherGroup(_, args, ctx) {
    return ctx.em.load(PublisherGroup, args.id);
  },
};

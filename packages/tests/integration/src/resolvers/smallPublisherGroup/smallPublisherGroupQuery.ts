import { SmallPublisherGroup } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const smallPublisherGroup: Pick<QueryResolvers, "smallPublisherGroup"> = {
  async smallPublisherGroup(_, args, ctx) {
    return ctx.em.load(SmallPublisherGroup, args.id);
  },
};

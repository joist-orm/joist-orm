import { SmallPublisher } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const smallPublisher: Pick<QueryResolvers, "smallPublisher"> = {
  async smallPublisher(_, args, ctx) {
    return ctx.em.load(SmallPublisher, args.id);
  },
};

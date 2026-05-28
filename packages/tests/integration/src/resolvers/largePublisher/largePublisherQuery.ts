import { LargePublisher } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const largePublisher: Pick<QueryResolvers, "largePublisher"> = {
  async largePublisher(_, args, ctx) {
    return ctx.em.load(LargePublisher, args.id);
  },
};

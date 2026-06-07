import { Publisher } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const publisher: Pick<QueryResolvers, "publisher"> = {
  async publisher(_, args, ctx) {
    return ctx.em.load(Publisher, args.id);
  },
};

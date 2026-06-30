import { Tag } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const tag: Pick<QueryResolvers, "tag"> = {
  async tag(_, args, ctx) {
    return ctx.em.load(Tag, args.id);
  },
};

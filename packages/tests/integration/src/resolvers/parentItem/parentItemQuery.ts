import { ParentItem } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const parentItem: Pick<QueryResolvers, "parentItem"> = {
  async parentItem(_, args, ctx) {
    return ctx.em.load(ParentItem, args.id);
  },
};

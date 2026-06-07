import { ChildItem } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const childItem: Pick<QueryResolvers, "childItem"> = {
  async childItem(_, args, ctx) {
    return ctx.em.load(ChildItem, args.id);
  },
};

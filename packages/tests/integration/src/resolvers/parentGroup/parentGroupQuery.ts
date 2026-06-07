import { ParentGroup } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const parentGroup: Pick<QueryResolvers, "parentGroup"> = {
  async parentGroup(_, args, ctx) {
    return ctx.em.load(ParentGroup, args.id);
  },
};

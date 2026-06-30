import { ChildGroup } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const childGroup: Pick<QueryResolvers, "childGroup"> = {
  async childGroup(_, args, ctx) {
    return ctx.em.load(ChildGroup, args.id);
  },
};

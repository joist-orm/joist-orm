import { Child } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const child: Pick<QueryResolvers, "child"> = {
  async child(_, args, ctx) {
    return ctx.em.load(Child, args.id);
  },
};

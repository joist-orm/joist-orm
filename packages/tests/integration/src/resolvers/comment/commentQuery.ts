import { Comment } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const comment: Pick<QueryResolvers, "comment"> = {
  async comment(_, args, ctx) {
    return ctx.em.load(Comment, args.id);
  },
};

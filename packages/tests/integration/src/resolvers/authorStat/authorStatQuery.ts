import { AuthorStat } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const authorStat: Pick<QueryResolvers, "authorStat"> = {
  async authorStat(_, args, ctx) {
    return ctx.em.load(AuthorStat, args.id);
  },
};

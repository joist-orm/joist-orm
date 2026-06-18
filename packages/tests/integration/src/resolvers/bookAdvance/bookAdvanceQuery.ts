import { BookAdvance } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const bookAdvance: Pick<QueryResolvers, "bookAdvance"> = {
  async bookAdvance(_, args, ctx) {
    return ctx.em.load(BookAdvance, args.id);
  },
};

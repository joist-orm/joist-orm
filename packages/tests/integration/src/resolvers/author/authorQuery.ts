import { Author } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const author: Pick<QueryResolvers, "author"> = {
  async author(_, args, ctx) {
    return ctx.em.load(Author, args.id);
  },
};

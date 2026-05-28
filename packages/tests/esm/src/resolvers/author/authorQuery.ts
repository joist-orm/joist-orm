import { Author } from "src/entities/index.js";
import type { QueryResolvers } from "src/generated/graphql-types.js";

export const author: Pick<QueryResolvers, "author"> = {
  async author(_, args, ctx) {
    return ctx.em.load(Author, args.id);
  },
};

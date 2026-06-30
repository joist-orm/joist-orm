import { User } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const user: Pick<QueryResolvers, "user"> = {
  async user(_, args, ctx) {
    return ctx.em.load(User, args.id);
  },
};

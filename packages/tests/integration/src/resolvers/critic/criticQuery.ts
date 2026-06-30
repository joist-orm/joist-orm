import { Critic } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const critic: Pick<QueryResolvers, "critic"> = {
  async critic(_, args, ctx) {
    return ctx.em.load(Critic, args.id);
  },
};

import { Critic } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveCritic: Pick<MutationResolvers, "saveCritic"> = {
  async saveCritic(_, args, ctx) {
    return { critic: await saveEntity(ctx, Critic, args.input) };
  },
};

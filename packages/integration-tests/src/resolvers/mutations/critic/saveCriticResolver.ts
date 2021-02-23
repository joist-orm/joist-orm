import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntities } from "src/resolvers/mutations/utils";
import { Critic } from "src/entities";

export const saveCritic: Pick<MutationResolvers, "saveCritic"> = {
  async saveCritic(root, args, ctx) {
    const [id] = await saveEntities(ctx, Critic, [args.input]);
    return { critic: id };
  },
};

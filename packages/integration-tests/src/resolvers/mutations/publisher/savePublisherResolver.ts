import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntities } from "src/resolvers/mutations/utils";
import { Publisher } from "src/entities";

export const savePublisher: Pick<MutationResolvers, "savePublisher"> = {
  async savePublisher(root, args, ctx) {
    const [id] = await saveEntities(ctx, Publisher, [args.input]);
    return { publisher: id };
  },
};

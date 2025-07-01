import { SmallPublisher } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntities } from "src/resolvers/mutations/utils";

export const savePublisher: Pick<MutationResolvers, "savePublisher"> = {
  async savePublisher(root, args, ctx) {
    const [id] = await saveEntities(ctx, SmallPublisher, [args.input]);
    return { publisher: id };
  },
};

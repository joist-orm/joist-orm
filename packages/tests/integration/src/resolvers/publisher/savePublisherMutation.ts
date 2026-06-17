import { Publisher } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const savePublisher: Pick<MutationResolvers, "savePublisher"> = {
  async savePublisher(_, args, ctx) {
    return { publisher: await saveEntity(ctx, Publisher, args.input) };
  },
};

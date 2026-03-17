import { Image } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveImage: Pick<MutationResolvers, "saveImage"> = {
  async saveImage(_, args, ctx) {
    return { image: await saveEntity(ctx, Image, args.input) };
  },
};

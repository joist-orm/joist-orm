import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntities } from "src/resolvers/mutations/utils";
import { Image } from "src/entities";

export const saveImage: Pick<MutationResolvers, "saveImage"> = {
  async saveImage(root, args, ctx) {
    const [id] = await saveEntities(ctx, Image, [args.input]);
    return { image: id };
  },
};

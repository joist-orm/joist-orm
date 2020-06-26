import { Resolvers } from "@src/generated/graphql-types";
import { ImageTypes, PublisherSizes } from "@src/entities";

type EnumDetails = "ImageTypeDetail" | "PublisherSizeDetail";

export const enumResolvers: Pick<Resolvers, EnumDetails> = {
  ImageTypeDetail: {
    code: (root) => root,
    name: (root) => ImageTypes.getByCode(root).name,
  },

  PublisherSizeDetail: {
    code: (root) => root,
    name: (root) => PublisherSizes.getByCode(root).name,
  },
};

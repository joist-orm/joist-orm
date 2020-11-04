import { AdvanceStatuses, ImageTypes, PublisherSizes } from "src/entities";
import { Resolvers } from "src/generated/graphql-types";

type EnumDetails = "AdvanceStatusDetail" | "ImageTypeDetail" | "PublisherSizeDetail";

export const enumResolvers: Pick<Resolvers, EnumDetails> = {
  AdvanceStatusDetail: {
    code: (root) => root,
    name: (root) => AdvanceStatuses.getByCode(root).name,
  },

  ImageTypeDetail: {
    code: (root) => root,
    name: (root) => ImageTypes.getByCode(root).name,
    sortOrder: (root) => ImageTypes.getByCode(root).sortOrder,
  },

  PublisherSizeDetail: {
    code: (root) => root,
    name: (root) => PublisherSizes.getByCode(root).name,
  },
};

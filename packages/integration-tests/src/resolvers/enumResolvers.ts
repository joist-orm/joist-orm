import { AdvanceStatuses, Colors, ImageTypes, PublisherSizes, PublisherTypes } from "src/entities";
import { Resolvers } from "src/generated/graphql-types";

type EnumDetails =
  | "AdvanceStatusDetail"
  | "ColorDetail"
  | "ImageTypeDetail"
  | "PublisherSizeDetail"
  | "PublisherTypeDetail";

export const enumResolvers: Pick<Resolvers, EnumDetails> = {
  AdvanceStatusDetail: {
    code: (root) => root,
    name: (root) => AdvanceStatuses.getByCode(root).name,
  },

  ColorDetail: {
    code: (root) => root,
    name: (root) => Colors.getByCode(root).name,
  },

  ImageTypeDetail: {
    code: (root) => root,
    name: (root) => ImageTypes.getByCode(root).name,
    sortOrder: (root) => ImageTypes.getByCode(root).sortOrder,
    visible: (root) => ImageTypes.getByCode(root).visible,
    nickname: (root) => ImageTypes.getByCode(root).nickname,
  },

  PublisherSizeDetail: {
    code: (root) => root,
    name: (root) => PublisherSizes.getByCode(root).name,
  },

  PublisherTypeDetail: {
    code: (root) => root,
    name: (root) => PublisherTypes.getByCode(root).name,
  },
};

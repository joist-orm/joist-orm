import { Resolvers } from "src/generated/graphql-types";

type EnumDetails =
  | "AdvanceStatusDetail"
  | "ColorDetail"
  | "ImageTypeDetail"
  | "PublisherSizeDetail"
  | "PublisherTypeDetail";

export const enumResolvers: Pick<Resolvers, EnumDetails> = {
  AdvanceStatusDetail: {
    code: (root) => root.code,
    name: (root) => root.name,
  },

  ColorDetail: {
    code: (root) => root.code,
    name: (root) => root.name,
  },

  ImageTypeDetail: {
    code: (root) => root.code,
    name: (root) => root.name,
    sortOrder: (root) => root.sortOrder,
    visible: (root) => root.visible,
    nickname: (root) => root.nickname,
  },

  PublisherSizeDetail: {
    code: (root) => root.code,
    name: (root) => root.name,
  },

  PublisherTypeDetail: {
    code: (root) => root.code,
    name: (root) => root.name,
  },
};

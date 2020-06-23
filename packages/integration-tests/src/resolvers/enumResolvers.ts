import { Resolvers } from "@src/generated/graphql-types";
import { PublisherSizes } from "@src/entities";

type EnumDetails = "PublisherSizeDetail";

export const enumResolvers: Pick<Resolvers, EnumDetails> = {
  PublisherSizeDetail: {
    code: (root) => root,
    name: (root) => PublisherSizes.getByCode(root).name,
  },
};

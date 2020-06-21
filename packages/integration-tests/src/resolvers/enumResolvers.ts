import { Resolvers } from "@src/generated/graphql-types";
import { PublisherSizes } from "@src/entities";

type Enums = "PublisherSize";

export const enumResolvers: Pick<Resolvers, Enums> = {
  PublisherSize: {
    code: (root) => root,
    name: (root) => PublisherSizes.getByCode(root).name,
  },
};

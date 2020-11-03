import { ImageResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/entityResolver";
import { getMetadata } from "joist-orm";
import { Image } from "src/entities";

export const imageResolvers: ImageResolvers = {
  ...entityResolver(getMetadata(Image)),
};

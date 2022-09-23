import { getMetadata } from "joist-orm";
import { Image } from "src/entities";
import { ImageResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const imageResolvers: ImageResolvers = {
  ...entityResolver(getMetadata(Image)),
};

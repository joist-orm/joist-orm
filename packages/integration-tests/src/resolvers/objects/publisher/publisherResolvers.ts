import { getMetadata } from "joist-orm";
import { Publisher } from "src/entities";
import { PublisherResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/entityResolver";

export const publisherResolvers: PublisherResolvers = {
  ...entityResolver(getMetadata(Publisher)),
};

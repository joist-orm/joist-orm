import { PublisherResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/entityResolver";
import { getMetadata } from "joist-orm";
import { Publisher } from "src/entities";

export const publisherResolvers: PublisherResolvers = {
  ...entityResolver(getMetadata(Publisher)),
};

import { LargePublisher } from "src/entities";
import { LargePublisherResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const largePublisherResolvers: LargePublisherResolvers = {
  ...entityResolver(LargePublisher),
};

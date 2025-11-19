import { SmallPublisher } from "src/entities";
import { SmallPublisherResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const smallPublisherResolvers: SmallPublisherResolvers = { ...entityResolver(SmallPublisher) };

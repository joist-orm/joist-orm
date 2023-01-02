import { getMetadata } from "joist-orm";
import { SmallPublisher } from "src/entities";
import { SmallPublisherResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const smallPublisherResolvers: SmallPublisherResolvers = { ...entityResolver(getMetadata(SmallPublisher)) };

import { PublisherGroup } from "src/entities";
import { PublisherGroupResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const publisherGroupResolvers: PublisherGroupResolvers = { ...entityResolver(PublisherGroup) };

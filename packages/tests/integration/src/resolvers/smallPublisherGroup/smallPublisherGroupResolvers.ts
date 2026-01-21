import { SmallPublisherGroup } from "src/entities";
import { SmallPublisherGroupResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const smallPublisherGroupResolvers: SmallPublisherGroupResolvers = { ...entityResolver(SmallPublisherGroup) };

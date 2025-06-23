import { TinyPublisherGroup } from "src/entities";
import { TinyPublisherGroupResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const tinyPublisherGroupResolvers: TinyPublisherGroupResolvers = { ...entityResolver(TinyPublisherGroup) };

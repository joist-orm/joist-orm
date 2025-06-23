import { UserPublisherGroup } from "src/entities";
import { UserPublisherGroupResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const userPublisherGroupResolvers: UserPublisherGroupResolvers = { ...entityResolver(UserPublisherGroup) };

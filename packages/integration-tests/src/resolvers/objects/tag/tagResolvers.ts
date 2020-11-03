import { TagResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/entityResolver";
import { getMetadata } from "joist-orm";
import { Tag } from "src/entities";

export const tagResolvers: TagResolvers = {
  ...entityResolver(getMetadata(Tag)),
};

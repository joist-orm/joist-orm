import { getMetadata } from "joist-orm";
import { Tag } from "src/entities";
import { TagResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/entityResolver";

export const tagResolvers: TagResolvers = {
  ...entityResolver(getMetadata(Tag)),
};

import { Tag } from "src/entities";
import { TagResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const tagResolvers: TagResolvers = { ...entityResolver(Tag) };

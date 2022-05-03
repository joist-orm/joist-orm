import { getMetadata } from "joist-orm";
import { AuthorStat } from "src/entities";
import { AuthorStatResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/entityResolver";

export const authorStatResolvers: AuthorStatResolvers = {
  ...entityResolver(getMetadata(AuthorStat)),
};

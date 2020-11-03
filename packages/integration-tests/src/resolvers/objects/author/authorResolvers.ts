import { getMetadata } from "joist-orm";
import { Author } from "src/entities";
import { AuthorResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/entityResolver";

export const authorResolvers: AuthorResolvers = {
  ...entityResolver(getMetadata(Author)),
};

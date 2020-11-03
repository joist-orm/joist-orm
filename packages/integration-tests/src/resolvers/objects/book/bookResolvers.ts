import { getMetadata } from "joist-orm";
import { Book } from "src/entities";
import { BookResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/entityResolver";

export const bookResolvers: BookResolvers = {
  ...entityResolver(getMetadata(Book)),
};

import { BookResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/entityResolver";
import { getMetadata } from "joist-orm";
import { Book } from "src/entities";

export const bookResolvers: BookResolvers = {
  ...entityResolver(getMetadata(Book)),
};

import { Book } from "src/entities";
import { BookResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const bookResolvers: BookResolvers = {
  ...entityResolver(Book),
};

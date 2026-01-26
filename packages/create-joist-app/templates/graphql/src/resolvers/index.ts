import { authorResolvers } from "./authorResolvers";
import { bookResolvers } from "./bookResolvers";

export const resolvers = {
  Query: {
    ...authorResolvers.Query,
    ...bookResolvers.Query,
  },
  Mutation: {
    ...authorResolvers.Mutation,
    ...bookResolvers.Mutation,
  },
  Author: authorResolvers.Author,
  Book: bookResolvers.Book,
};

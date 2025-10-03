import { Author } from "src/entities/index.js";
import { AuthorResolvers } from "src/generated/graphql-types.js";
import { entityResolver } from "src/resolvers/utils.js";

export const authorResolvers: AuthorResolvers = { ...entityResolver(Author) };
